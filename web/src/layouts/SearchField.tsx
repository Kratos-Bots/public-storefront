import { TextInput } from '@mantine/core';
import { SearchIcon } from '@/components/icons.tsx';
import classes from '@/layouts/SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/** Header search box, shared by both shells. */
export function SearchField({ value, onChange, placeholder = 'Search products', className }: SearchFieldProps) {
  return (
    <TextInput
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      aria-label="Search products"
      variant="unstyled"
      size="sm"
      leftSection={<SearchIcon size={14} />}
      leftSectionWidth={26}
      classNames={{
        root: className ? `${classes.root} ${className}` : classes.root,
        input: classes.input,
        section: classes.section,
      }}
    />
  );
}
