"use client";

import { Select } from "@base-ui/react/select";
import { type ReactNode } from "react";

type ContextOption = { value: string; label: string; icon: ReactNode; description?: string };

export function ContextSelect({ id, label, value, options, onValueChange }: {
  id: string;
  label: string;
  value: string;
  options: ContextOption[];
  onValueChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);

  return <Select.Root value={value} items={options} modal={false} onValueChange={(next) => { if (next !== null) onValueChange(next); }}>
    <Select.Trigger id={id} aria-label={label} className="context-select-trigger">
      <span className="context-select-glyph" aria-hidden="true">{selected?.icon}</span>
      <Select.Value className="context-select-value" />
      <Select.Icon className="context-select-chevron"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner className="context-select-positioner" alignItemWithTrigger={false} align="start" sideOffset={6} collisionPadding={10}>
        <Select.Popup className="context-select-popup">
          <Select.List className="context-select-list" aria-label={label}>
            {options.map((option) => <Select.Item className="context-select-option" key={option.value} value={option.value} label={option.label}>
              <span className="context-select-glyph" aria-hidden="true">{option.icon}</span>
              <span className="context-select-copy">
                <Select.ItemText className="context-select-option-label">{option.label}</Select.ItemText>
                {option.description && <span className="context-select-description">{option.description}</span>}
              </span>
              <Select.ItemIndicator className="context-select-check"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 10 3 3 6-6" /></svg></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}
