'use client';

import { Settings2Icon } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';

function VolumeRow({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  const span = max - min || 1;
  const fill = Math.max(0, Math.min(1, (value - min) / span));

  return (
    <div className="volume-row" style={{ display: 'grid', gap: 6, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-xs tabular-nums">{pct}%</span>
      </div>
      <div
        className="volume-track"
        style={{
          position: 'relative',
          width: '100%',
          height: 20,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 8,
            borderRadius: 999,
            background: '#c5d4c8',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            width: `${fill * 100}%`,
            height: 8,
            borderRadius: 999,
            background: '#246849',
          }}
        />
        <input
          id={id}
          type="range"
          className="luma-range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={`${pct} percent`}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            margin: 0,
            accentColor: '#246849',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.45 : 1,
          }}
        />
      </div>
    </div>
  );
}

export function AudioSettingsDialog({
  enabled,
  voiceVolume,
  voiceMuted,
  originalVolume,
  duckOriginal,
  duckLevel,
  canDuckOriginal,
  onVoiceVolume,
  onVoiceMuted,
  onOriginalVolume,
  onDuckOriginal,
  onDuckLevel,
}: {
  enabled: boolean;
  voiceVolume: number;
  voiceMuted: boolean;
  originalVolume: number;
  duckOriginal: boolean;
  duckLevel: number;
  canDuckOriginal: boolean;
  onVoiceVolume: (v: number) => void;
  onVoiceMuted: (v: boolean) => void;
  onOriginalVolume: (v: number) => void;
  onDuckOriginal: (v: boolean) => void;
  onDuckLevel: (v: number) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!enabled}
          title={enabled ? 'Audio settings' : 'Enable Text + voice to adjust audio'}
          aria-label="Audio settings"
        >
          <Settings2Icon className="size-4" />
          Audio settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" aria-describedby="audio-settings-desc">
        <DialogHeader>
          <DialogTitle>Audio settings</DialogTitle>
          <DialogDescription id="audio-settings-desc">
            Volumes stay when this dialog closes. Listening quieter never weakens recognition audio.
            {!canDuckOriginal
              ? ' Ducking needs a browser tab capture that suppresses local playback.'
              : null}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'grid', gap: 16, width: '100%' }}>
          <VolumeRow
            id="translation-volume"
            label="Translation volume"
            value={voiceVolume}
            min={0}
            max={1}
            step={0.05}
            disabled={voiceMuted}
            onChange={onVoiceVolume}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Label htmlFor="mute-translation">Mute translation</Label>
            <Switch id="mute-translation" checked={voiceMuted} onCheckedChange={onVoiceMuted} />
          </div>

          <Separator />

          {canDuckOriginal ? (
            <>
              <VolumeRow
                id="original-volume"
                label="Original volume"
                value={originalVolume}
                min={0}
                max={1}
                step={0.05}
                onChange={onOriginalVolume}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Label htmlFor="duck-original">Lower original during translation</Label>
                <Switch
                  id="duck-original"
                  checked={duckOriginal}
                  onCheckedChange={onDuckOriginal}
                />
              </div>

              {duckOriginal ? (
                <VolumeRow
                  id="duck-level"
                  label="While translating"
                  value={duckLevel}
                  min={0.1}
                  max={0.4}
                  step={0.05}
                  onChange={onDuckLevel}
                />
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">
              This browser didn’t suppress the tab’s speakers, so Luma can’t duck the original
              safely. Lower Teams/YouTube volume manually.
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** @deprecated Prefer AudioSettingsDialog */
export const AudioSettingsPopover = AudioSettingsDialog;
