'use client';

import { DualTranscriptPanel, Brand, PrivacyLabel, StatusLine, type TranscriptItem } from '@luma/ui';
import {
  ArrowLeftRightIcon,
  AudioLinesIcon,
  EraserIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AudioSettingsDialog } from '@/components/AudioSettingsDialog';
import { StatusIndicator, statusToneFromState } from '@/components/StatusIndicator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

const FIXTURE: TranscriptItem[] = [
  {
    kind: 'entry',
    entry: {
      segmentId: 'p1',
      timeLabel: '',
      showOriginal: true,
      fontSize: 18,
      final: true,
      sourceLang: 'ko',
      targetLang: 'en',
      originalText:
        '안녕하세요. 오늘 회의를 시작하겠습니다. 먼저 지난주에 논의한 제품 로드맵을 다시 살펴보고, 이번 분기 우선순위를 정리해 보겠습니다. 특히 실시간 번역 기능과 접근성 개선 항목이 중요합니다.',
      translatedText:
        'Hello. Let’s start today’s meeting. First, we’ll revisit the product roadmap we discussed last week and organize this quarter’s priorities. In particular, the live translation feature and accessibility improvements are important.',
    },
  },
  {
    kind: 'entry',
    entry: {
      segmentId: 'p2',
      timeLabel: '',
      showOriginal: true,
      fontSize: 18,
      final: true,
      sourceLang: 'ko',
      targetLang: 'en',
      originalText:
        '다음으로 고객 피드백을 공유하겠습니다. 여러 사용자가 긴 미팅에서도 문단 단위로 읽기 쉬운 자막을 원한다고 했습니다. 짧은 조각으로 나뉘면 집중이 깨진다는 의견이 많았습니다.',
      translatedText:
        'Next, I’ll share customer feedback. Several users said they want readable, paragraph-style captions even in long meetings. Many noted that short fragmented chunks break their concentration.',
    },
  },
  {
    kind: 'entry',
    entry: {
      segmentId: 'p3',
      timeLabel: '',
      showOriginal: true,
      fontSize: 18,
      final: false,
      sourceLang: 'ko',
      targetLang: 'en',
      originalText:
        '그래서 오늘은 원문과 번역을 나란히 보여 주는 연속 문단 레이아웃을 확인하려고 합니다. 질문이 있으시면…',
      translatedText:
        'So today we want to verify the side-by-side continuous paragraph layout for original and translation. If you have any questions…',
    },
  },
];

type PreviewState = 'empty' | 'ready' | 'listening' | 'paused' | 'error';

function PreviewInner() {
  const params = useSearchParams();
  const state = (params.get('state') as PreviewState) || 'listening';
  const [voiceVolume, setVoiceVolume] = useState(0.85);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [duckOriginal, setDuckOriginal] = useState(true);
  const [duckLevel, setDuckLevel] = useState(0.2);
  const [items, setItems] = useState(() =>
    state === 'empty' || state === 'ready' || state === 'error' ? [] : FIXTURE,
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const [fontSize, setFontSize] = useState(18);

  const hasSource = state !== 'empty';
  const voiceSafe = state !== 'empty';
  const showStop = state === 'listening' || state === 'paused' || state === 'error';
  const status =
    state === 'empty'
      ? 'Choose languages and an audio source'
      : state === 'ready'
        ? 'Audio ready — not translating'
        : state === 'paused'
          ? 'Paused'
          : state === 'error'
            ? 'Something went wrong'
            : 'Listening';
  const primary =
    state === 'listening' ? 'Pause' : state === 'paused' ? 'Resume' : hasSource ? 'Start translation' : 'Choose audio source';
  const primaryIcon =
    primary === 'Pause' ? (
      <PauseIcon className="size-4" aria-hidden />
    ) : primary === 'Resume' || primary === 'Start translation' ? (
      <PlayIcon className="size-4" aria-hidden />
    ) : (
      <AudioLinesIcon className="size-4" aria-hidden />
    );
  const stageClass = useMemo(() => {
    const bits = ['stage', 'stage--live'];
    if (state === 'listening') bits.push('is-listening', 'is-active');
    if (state === 'paused') bits.push('is-paused', 'is-active');
    if (state === 'error') bits.push('is-error');
    return bits.join(' ');
  }, [state]);

  return (
    <main className="app-shell app-shell--live">
      <header className="app-header app-header--compact">
        <Brand compact />
        <PrivacyLabel />
      </header>

      <div className={stageClass} data-preview-state={state}>
        <section className="session-toolbar" aria-label="Session controls">
          <div className="session-toolbar-row">
            <div className="lang-pair lang-pair--compact" role="group" aria-label="Language pair">
              <div className="lang-combobox lang-combobox--compact">
                <span className="lang-combobox-label">From</span>
                <Button type="button" variant="outline" className="session-control min-w-[8.5rem] justify-between font-semibold">
                  Korean
                </Button>
              </div>
              <Button type="button" variant="ghost" className="lang-swap session-control-icon shrink-0" aria-label="Swap languages">
                <ArrowLeftRightIcon className="size-4" aria-hidden />
              </Button>
              <div className="lang-combobox lang-combobox--compact">
                <span className="lang-combobox-label">To</span>
                <Button type="button" variant="outline" className="session-control min-w-[8.5rem] justify-between font-semibold">
                  English
                </Button>
              </div>
            </div>

            <div className={`session-source-slot${hasSource ? ' has-source' : ''}`}>
              {hasSource ? (
                <div
                  className="session-source-card"
                  title="YouTube — Product roadmap review — Browser tab · original routed through Luma"
                >
                  <AudioLinesIcon className="session-source-card-icon size-3.5" aria-hidden />
                  <div className="session-source-text">
                    <span className="session-source-name">YouTube — Product roadmap review</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="session-source-change"
                    title="Change audio source"
                    aria-label="Change audio source"
                  >
                    <RefreshCwIcon className="size-3.5" aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="session-source-placeholder" aria-hidden>
                  <span className="session-source-placeholder-label">
                    <AudioLinesIcon className="size-3.5" aria-hidden />
                    Audio source
                  </span>
                  <span className="session-source-placeholder-hint">Not chosen yet</span>
                </div>
              )}
            </div>

            <div className="session-output">
              <div className="session-output-modes">
                <ToggleGroup type="single" value={voiceSafe ? 'text-voice' : 'text'} variant="outline" spacing={0}>
                  <ToggleGroupItem value="text" className="session-control px-3.5 text-sm">
                    Text
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="text-voice"
                    className="session-control px-3.5 text-sm"
                    disabled={!voiceSafe}
                    title={
                      voiceSafe
                        ? 'Play translated speech with subtitles'
                        : 'Choose a Chrome tab (Teams / YouTube) with Share tab audio. Window or entire-screen capture can’t use Text + voice — Luma would hear its own speech.'
                    }
                  >
                    Text + voice
                  </ToggleGroupItem>
                </ToggleGroup>
                {!voiceSafe ? (
                  <p
                    className="session-help"
                    role="note"
                    title="Choose a Chrome tab (Teams / YouTube) with Share tab audio. Window or entire-screen capture can’t use Text + voice — Luma would hear its own speech."
                  >
                    Needs a Chrome tab + Share tab audio.
                  </p>
                ) : null}
              </div>
              {voiceSafe ? (
                <AudioSettingsDialog
                  enabled
                  voiceVolume={voiceVolume}
                  voiceMuted={voiceMuted}
                  originalVolume={originalVolume}
                  duckOriginal={duckOriginal}
                  duckLevel={duckLevel}
                  canDuckOriginal={voiceSafe}
                  onVoiceVolume={setVoiceVolume}
                  onVoiceMuted={setVoiceMuted}
                  onOriginalVolume={setOriginalVolume}
                  onDuckOriginal={setDuckOriginal}
                  onDuckLevel={setDuckLevel}
                />
              ) : null}
            </div>
          </div>

          <div className="session-toolbar-row session-toolbar-row--actions">
            <StatusLine
              tone={statusToneFromState(state, hasSource)}
              indicator={
                <StatusIndicator
                  tone={statusToneFromState(state, hasSource)}
                  activity={state === 'listening' ? 0.55 : 0}
                />
              }
            >
              {status}
            </StatusLine>
            {state === 'listening' || state === 'paused' ? (
              <span className="session-timer">01:24</span>
            ) : null}
            <div className="session-actions">
              {showStop ? (
                <Button type="button" variant="outline" className="session-control">
                  <SquareIcon className="size-3.5 fill-current" aria-hidden />
                  Stop
                </Button>
              ) : null}
              <Button type="button" className="session-primary session-control">
                {primaryIcon}
                {primary}
              </Button>
            </div>
          </div>

          {state === 'error' ? (
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>The shared tab closed. Translation stopped.</AlertDescription>
              <AlertAction>
                <Button type="button" variant="outline" className="session-control">
                  Choose source again
                </Button>
              </AlertAction>
            </Alert>
          ) : null}
        </section>

        <section className="subtitle-stage transcript-stage" aria-label="Live transcript">
          <div className="transcript-chrome">
            <DualTranscriptPanel
              items={items}
              sourceLanguageName="Korean"
              targetLanguageName="English"
              sourceLangCode="ko"
              targetLangCode="en"
              fontSize={fontSize}
              emptyOriginal={
                state === 'paused'
                  ? 'Paused — resume to continue capturing speech.'
                  : hasSource
                    ? 'Audio ready — your captured speech appears here.'
                    : 'Your captured speech appears here.'
              }
              emptyTranslation={
                state === 'paused'
                  ? 'Paused — resume to continue translating.'
                  : hasSource
                    ? 'Audio ready — your translation appears here.'
                    : 'Your translation appears here.'
              }
              toolbar={
                <>
                  <div className="font-size-controls" role="group" aria-label="Text size">
                    <span className="font-size-label">Text size</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="session-control-icon"
                      disabled={fontSize <= 14}
                      onClick={() => setFontSize((n) => Math.max(14, n - 2))}
                      aria-label="Decrease text size"
                    >
                      A−
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="session-control-icon"
                      disabled={fontSize >= 28}
                      onClick={() => setFontSize((n) => Math.min(28, n + 2))}
                      aria-label="Increase text size"
                    >
                      A+
                    </Button>
                  </div>
                  {items.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="session-control"
                      onClick={() => setConfirmClear(true)}
                    >
                      <EraserIcon className="size-4" aria-hidden />
                      Clear both
                    </Button>
                  ) : null}
                </>
              }
            />
          </div>
        </section>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear both transcripts?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes original and translation text from this session. Translation keeps running if
              it is already active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep text</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setItems([]);
                setConfirmClear(false);
              }}
            >
              Clear both
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export default function TranscriptPreviewPage() {
  return (
    <Suspense fallback={<main className="app-shell">Loading…</main>}>
      <PreviewInner />
    </Suspense>
  );
}
