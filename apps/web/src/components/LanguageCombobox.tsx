'use client';

import { useMemo, useState } from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
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
      options.map((code) => ({
        code,
        name: languages.find((l) => l.code === code)?.name ?? code,
      })),
    [options, languages],
  );

  const selected = labeled.find((o) => o.code === value);
  const noOptions = options.length === 0;

  return (
    <div className={cn('lang-combobox', compact ? 'min-w-[7.5rem]' : 'grid min-w-[150px] flex-1 gap-1.5')}>
      <span className="sr-only" id={`lang-label-${label}`}>
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`lang-label-${label}`}
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
              'justify-between font-semibold',
              compact ? 'h-8 max-w-[10rem] px-2.5 text-sm' : 'h-10 w-full',
            )}
          >
            <span className="truncate">{selected?.name ?? 'Select'}</span>
            <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
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
                    onSelect={() => {
                      onChange(opt.code);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{opt.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs uppercase">{opt.code}</span>
                    <CheckIcon
                      className={cn(
                        'ml-auto size-4',
                        opt.code === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
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
