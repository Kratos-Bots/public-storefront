import { Button } from '@mantine/core';
import { ApiError } from '@/lib/errors.ts';
import { useText } from '@/text/runtime.tsx';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';

/**
 * A product the chosen (non-default) warehouse does not carry answers the ordinary 404. When that is
 * the likely reason - a non-default warehouse is chosen and the shop's own is known - this says so and
 * offers the way back. `null` for any other failure, so the normal not-found view is untouched.
 */
export function useNotCarried(error: unknown): { message: string; switchBack: () => void; switchLabel: string } | null {
  const { selectedId, current, defaultWarehouse, select } = useSelectedWarehouse();
  const { t } = useText();
  if (selectedId === null || !current || !defaultWarehouse) return null;
  if (!(error instanceof ApiError) || error.status !== 404) return null;
  return {
    message: t('shell.warehouse.unavailable', { warehouse: current.name }),
    switchLabel: t('shell.warehouse.switchBack', { warehouse: defaultWarehouse.name }),
    switchBack: () => select(null),
  };
}

export function SwitchBackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="default" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
