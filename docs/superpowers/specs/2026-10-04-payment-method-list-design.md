# Payment method list and per-gateway return address: design

Date: 2026-10-04. Piece 4 of the checkout feedback (after form fixes, web collection points, unpaid order recovery).

## 1. What the owner asked for

"More than 2 payment methods, rename/reorder them, and a toggle to stop sending redirect URLs to processors."

Decisions taken with the owner:

| Question | Decision |
|---|---|
| Where the list applies | Storefront only. The Telegram bot keeps its Credit Card / Crypto buttons and its own two pickers. |
| Which methods are offered | The admin picks from enabled gateways: each entry can be shown or hidden. |
| Redirect switch | Per gateway, with an optional neutral return address per gateway. |
| Names (my ruling, accepted) | One name per method, set in the list, used everywhere on the storefront. Blank falls back to the gateway's own name. |
| Deploy | The starting list is what each shop offers today. Its card and crypto methods start named "Card" and "Crypto" (owner's decision): the order page is unchanged, the checkout step changes from the processor's brand to "Card". |

## 2. Today

- The storefront offers at most one "card" gateway and one "crypto" gateway (`storefront_payment_slot_card`, `storefront_payment_slot_crypto`, each falling back to the bot's slot), plus the three manual bank gateways. An enabled gateway mapped to neither slot is never offered (`listStorefrontPaymentMethods`, `public-storefront/checkout.ts`).
- Order is card, crypto, then manual gateways in unordered database row order.
- Names: the checkout step shows the gateway's fixed `displayName` ("Stripe"); the order page shows site text "Card" / "Crypto" by slot; the account order page shows the raw method id.
- Seven processors receive a customer return URL built from the shop's address: Stripe, PayPal, Revolut, OxaPay, NexaPay, Whop, Peer Pay. Settlement uses separate server-to-server webhooks and does not depend on the return URL.
- `settings.storeFrontUrl` must be set before any processor gateway can create a session.

## 3. The storefront payment method list

### 3.1 Storage

One `storefront_settings` key, `storefront_payment_methods`, holding a JSON array in display order:

```json
[
  { "method": "stripe", "enabled": true, "label": "Card" },
  { "method": "crypto", "enabled": true, "label": null },
  { "method": "uk_bank_transfer", "enabled": false, "label": null }
]
```

- `method`: a gateway `name` from the registry. The literal methods (`cash`, `bank_transfer`, `manual`, `store_credit`) are never list entries; the storefront does not offer them today and that is unchanged.
- `enabled`: whether the storefront shows it.
- `label`: the customer-facing name, 1 to 40 characters after trimming, or `null` to use the gateway's `displayName`.

No migration: `storefront_settings` is a key/value table.

### 3.2 The starting list

While the key is absent, the list is derived on every read and nothing is written:

1. the storefront card slot (falling back to the bot's card slot), if set;
2. the storefront crypto slot (falling back to the bot's), if set;
3. each manual bank gateway (`uk_bank_transfer`, `sepa_transfer`, `ach_wire`) that is enabled, in gateway id order.

All entries are `enabled: true`. The card entry's `label` is `"Card"` and the crypto entry's is `"Crypto"`, the names customers already see for them on the order page and in the bot; bank gateways have `label: null`. This reproduces today's offer and order, with two stated differences: the checkout step now says "Card" where it printed the processor's brand, and manual gateways have a defined order (id order) where today it is unspecified. A shop that had reworded the "Card" or "Crypto" site text gets the default wording until it renames the method in the list.

The first save writes the key. From then on the old slot keys are not read by the storefront. They are not deleted, and the bot's slot keys are untouched.

### 3.3 What a customer is offered

`listStorefrontPaymentMethods(country, orderTotal, groupId)` returns, in list order, each entry that is `enabled` and whose gateway passes the existing checks in `getAvailablePaymentMethods` (gateway enabled, minimum order amount, allowed countries, a crypto gateway has at least one enabled combination). Group payment rates apply as today.

- A gateway enabled after the list was saved is not offered until an admin adds it.
- Disabling a gateway leaves its entry in the list; it is simply not offered, and is offered again when re-enabled.
- An entry whose gateway no longer exists in the registry is ignored on read and dropped on the next save.
- A gateway with no processor (`sumup`) cannot be added (see 3.5).

### 3.4 Response shape

Each method keeps the existing fields. Changes:

- `displayName` is the entry's `label` when set, otherwise the gateway's `displayName`.
- `feeLabel` is built from that same name ("Card fee", "Card discount").
- `slot` stays in the response for storefronts deployed before this change: `manual` for a manual gateway, `crypto` for a gateway with `cryptoOptions` or the gateway mapped to the shop's crypto slot, otherwise `card`. New storefront code does not read it.

The same list, names and order serve the checkout quote (signed-in and guest) and the order page's `payment-options`.

### 3.5 Admin API

`GET /storefront-settings` gains `paymentMethods`: every list entry (saved or derived), each with `method`, `enabled`, `label`, and read-only `displayName`, `type` (`gateway` | `crypto` | `offline`) and `gatewayEnabled`. It also gains `paymentMethodChoices`: enabled gateways that may be added and are not in the list.

`PUT /storefront-settings` accepts `paymentMethods: [{ method, enabled, label }]`, replacing the whole list. Validation, each a 422 naming the entry:

- `method` exists in the registry, is not a literal method, and has a processor or is manual or crypto;
- no method appears twice;
- `label`, when present, is 1 to 40 characters after trimming.

A disabled gateway may be in the list (it may be re-enabled later). `paymentSlotCard` and `paymentSlotCrypto` stay accepted and stored for one release so an older admin build does not fail, but have no effect once the list key exists.

### 3.6 The order page accepts only offered methods

`selectPublicPaymentMethod` today accepts any enabled processor gateway by name. It now accepts only a method that `listStorefrontPaymentMethods` returns for that order (country, total, customer group), answering the existing "method not available" error otherwise. Checkout already enforces this through the quote.

### 3.7 Names on existing orders

- The public order view's payment fee label and active payment use the list name for the payment's method when the list has an entry for it, otherwise the gateway's `displayName`.
- The account order detail gains `methodLabel` on each payment, resolved the same way; the storefront shows it instead of the raw id.

Names are resolved at read time, so renaming a method renames it on past orders too. That is accepted: these are presentation names, and the stored payment keeps the gateway id.

## 4. Per-gateway return address

### 4.1 Settings

The seven gateways that send a customer return URL get two config fields, declared in the registry so the existing admin form renders them:

- `hideShopAddress` (boolean, default off): "Don't send my shop's address to this processor".
- `neutralReturnUrl` (URL, optional): "Return address to send instead".

A registry flag marks, per gateway, whether the processor requires a return URL (`returnUrlRequired`). Whether each of the seven requires one is verified against the processor's documentation during planning and recorded in the plan; the design does not assume.

Validation on `PATCH /payment-gateways/:id`: `neutralReturnUrl` must be an `https` URL when present; turning `hideShopAddress` on for a gateway with `returnUrlRequired` and no `neutralReturnUrl` is refused with a clear message.

### 4.2 Behaviour

One function, `resolveReturnUrls(gateway, order)`, replaces the two duplicated blocks in `orders/service.ts` (`createGatewayCheckoutSession` and `addPayment`):

| `hideShopAddress` | `neutralReturnUrl` | Sent as success and cancel URL |
|---|---|---|
| off | any | today's value: the order's public URL, else `storeFrontUrl/payment/success` and `/payment/cancel` |
| on | set | the neutral URL, unchanged (no order reference appended) |
| on | empty | nothing; the processor omits the field |

- `CreateSessionParams.successUrl` and `cancelUrl` become optional; each of the seven processors omits its return fields when they are absent.
- The `storeFrontUrl must be configured` check applies only when the shop's address would be sent.
- Server-to-server callback URLs (`callback_url` for OxaPay and NexaPay, Paygate's `callback`, registered webhooks) are not customer redirects and are not affected.
- The setting belongs to the gateway, so it applies to every order paid through it: storefront, bot and admin-created payments.

### 4.3 What the customer experiences

With the switch on and no neutral address, the customer finishes on the processor's own confirmation page and is not sent back. They reach their order through the confirmation message, the saved order link, their account, or the unpaid-order prompt. The admin field's help text says this.

## 5. Admin app

- **Storefront settings, Payments card:** the two dropdowns are replaced by the list. Each row: drag handle, name field (placeholder = the gateway's name), the gateway's own name and kind as secondary text, a show/hide switch, a remove control, and a "gateway is disabled" notice where that applies. Below the list, an "Add a payment method" select fed by `paymentMethodChoices`. Reordering reuses `features/promotions/use-drag-reorder.ts`, generalised from numeric ids to string keys. Saving goes through the page's existing save flow.
- **Settings, Payments, each of the seven gateways:** the two new fields render through the existing dynamic config form; the URL field is shown only while the switch is on, and is marked required for a gateway with `returnUrlRequired`.
- New wording follows the admin app's i18n rules.

## 6. Storefront

- **Checkout:** `PaymentStep` and `ReviewStep` already render any number of methods in backend order with `displayName`. No behaviour change beyond the names now being the admin's.
- **Order page:** `slotLabel` stops mapping slots to site text and uses `method.displayName`; the with-fee and with-discount wording stays. `isManual` reads `method.type === 'offline'` instead of `slot`.
- **Account order page:** shows `methodLabel`.
- **Types:** `PaymentMethod.slot` becomes optional and unused.
- **Site text:** `order.method.card` and `order.method.crypto` are retired through the text registry's procedure for removed keys.
- **Builder fixtures and e2e mocks** carry three or more methods with custom names.

## 7. Not in this piece

- The bot's payment buttons, labels and slot settings.
- `ecommerce-menu` and the desktop app.
- The customer order link path (`buildOrderPublicUrl` produces `<base>/<reference>/<key>` while the storefront route is `/order/<reference>/<key>`): raised with the owner separately.
- Per-currency or per-group visibility of methods.

## 8. Testing

- **Backend:** unit tests for the starting-list derivation (each slot combination, bot fallback), list filtering and order, name and fee-label resolution, save validation, and `slot` derivation; `selectPublicPaymentMethod` refusing an unoffered method; `resolveReturnUrls` for the three rows of the table; one test per processor that return fields are omitted when absent and that the callback URL is still sent.
- **Admin:** mocked browser pass over the list (add, rename, hide, reorder by pointer and keyboard, save) and the gateway fields.
- **Storefront:** unit tests for the order page naming and manual detection; e2e with four methods in a custom order with custom names on checkout, review, the order page and the account order page.

## 9. Rollout

Backend first, then the admin app, then the storefront (`web` minor bump and tag). No migration. An older storefront against the new backend keeps working through the retained `slot` field; an older admin build keeps saving the two slot fields without error.

Not verifiable locally: a real session created with the return URL omitted or replaced, for each of the seven processors.
