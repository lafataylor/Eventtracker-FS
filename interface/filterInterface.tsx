import { SingleValue } from 'react-select';

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface FilterItemProps {
  type: Option;
  condition: Option;
  conjugation: Option;
  values: any; // number[] | string[] | Date[] | SingleValue<Option>[];
}
