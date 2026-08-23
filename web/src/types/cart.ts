export interface ServerCartLine {
  productId: number; name: string; quantity: number; unitPrice: number; lineTotal: number;
  imageUrl: string | null; isPreorder: boolean; outOfStock: boolean; priceChanged: boolean; inactive: boolean;
}
export interface ServerCart { items: ServerCartLine[]; subtotal: number; itemCount: number }
export interface CartLineInput { productId: number; quantity: number }
