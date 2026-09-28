'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronsUpDownIcon } from 'lucide-react';
import type { LanguageInfo } from '../lib/api';
import { Button } from './ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';

export function LanguageCombobox({
  label,
  value,
  options,
  languages,
  disabled,
  title,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  options: string[];
  languages: LanguageInfo[];
  disabled?: boolean;
  title?: string;
  onChange: (code: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const labeled = useMemo(
    () =>
      options
        .map((code) => ({
          code,
          name: languages.find((l) => l.code === code)?.name ?? code,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [options, languages],
  );

  const selected = labeled.find((o) => o.code === value);
  const noOptions = options.length === 0;
  const labelId = `lang-label-${label.replace(/\s+/g, '-').toLowerCase()}`;

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-slot="command-item"][data-checked="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, value]);

  return (
    <div className={cn('lang-combobox', compact && 'lang-combobox--compact')}>
      <span className="lang-combobox-label" id={labelId}>
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={labelId}
            disabled={disabled || noOptions}
            title={
              title ??
              (disabled
                ? 'Unavailable right now'
                : noOptions
                  ? 'No languages available'
                  : label)
            }
            className={cn(
              'session-control justify-between font-semibold',
              compact ? 'min-w-[8.5rem] max-w-[11rem] px-3' : 'w-full',
            )}
          >
            <span className="truncate">{selected?.name ?? 'Select'}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="lang-popover w-[17.5rem] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search languages…" />
            <CommandList>
              <CommandEmpty>No languages match.</CommandEmpty>
              <CommandGroup>
                {labeled.map((opt) => (
                  <CommandItem
                    key={opt.code}
                    value={`${opt.name} ${opt.code}`}
                    data-checked={opt.code === value || undefined}
                    className="lang-option"
                    onSelect={() => {
                      onChange(opt.code);
                      setOpen(false);
                    }}
                  >
                    <span className="lang-option-name">{opt.name}</span>
                    <span className="lang-option-code">{opt.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
