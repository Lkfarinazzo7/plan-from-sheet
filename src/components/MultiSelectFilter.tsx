import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type MultiOption = { value: string; label: string };

interface MultiSelectFilterProps {
  label: string;
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholderAll?: string;
  widthClass?: string;
  searchable?: boolean;
}

export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  placeholderAll = 'Todos',
  widthClass = 'w-[200px]',
  searchable = false,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const active = value.length > 0;
  const filteredOptions = searchable && query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  };

  const summary = () => {
    if (value.length === 0) return placeholderAll;
    if (value.length === 1) {
      return options.find(o => o.value === value[0])?.label ?? placeholderAll;
    }
    return `${value.length} selecionados`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            widthClass,
            'justify-between font-normal',
            active && 'border-primary ring-2 ring-primary/30 bg-primary/5 text-primary'
          )}
        >
          <span className="truncate text-left">
            <span className="text-muted-foreground mr-1">{label}:</span>
            <span className={cn(active && 'font-medium')}>{summary()}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[240px]" align="start">
        <div className="p-2 border-b flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">{label}</span>
          {active && (
            <button
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>
        {searchable && (
          <div className="p-2 border-b">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full h-8 px-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
        <div className="max-h-[280px] overflow-y-auto py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              Nenhuma opção
            </div>
          ) : (
            filteredOptions.map(opt => {
              const checked = value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
                >
                  <div
                    className={cn(
                      'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                      checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
