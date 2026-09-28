'use client';

import { DualTranscriptPanel, Brand, PrivacyLabel, type TranscriptItem } from '@luma/ui';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AudioSettingsDialog } from '@/components/AudioSettingsDialog';
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
import { useState } from 'react';

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
  {
    kind: 'entry',
    entry: {
      segmentId: 'p4',
      timeLabel: '',
      showOriginal: true,
      fontSize: 18,
      final: true,
      sourceLang: 'km',
      targetLang: 'en',
      originalText:
        'យើងចង់ធានាថាអត្ថបទខ្មែរអានបានស្រួលក្នុងបន្ទាត់វែងៗ ដោយរក្សាគម្លាតបន្ទាត់សមរម្យ និងពុម្ពអក្សរដែលស័ក្តិសម។',
      translatedText:
        'We want to ensure long Khmer lines stay readable with comfortable line spacing and suitable font fallbacks.',
    },
  },
];

export default function TranscriptPreviewPage() {
  const [voiceVolume, setVoiceVolume] = useState(0.85);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [duckOriginal, setDuckOriginal] = useState(true);
  const [duckLevel, setDuckLevel] = useState(0.2);
  const [items, setItems] = useState(FIXTURE);
  const [confirmClear, setConfirmClear] = useState(false);
  const [fontSize, setFontSize] = useState(18);

  return (
    <main className="app-shell app-shell--live">
      <header className="app-header app-header--compact">
        <Brand compact />
        <PrivacyLabel />
      </header>

      <div className="stage stage--live is-listening is-active">
        <section className="session-toolbar" aria-label="Session controls">
          <div className="session-toolbar-row">
            <div className="lang-pair lang-pair--compact" role="group" aria-label="Language pair">
              <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 font-semibold">
                Korean
              </Button>
              <span className="lang-swap" aria-hidden>
                ⇄
              </span>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 font-semibold">
                English
              </Button>
            </div>
            <div className="session-source" title="YouTube — Product roadmap review">
              <div className="session-source-text">
                <span className="session-source-name">YouTube — Product roadmap review</span>
                <span className="session-source-detail">Browser tab · original routed through Luma</span>
              </div>
              <Button type="button" variant="outline" size="sm" title="Stop translation to change source">
                Change
              </Button>
            </div>
            <div className="session-output">
              <ToggleGroup type="single" value="text-voice" variant="outline" spacing={0} size="sm">
                <ToggleGroupItem value="text" className="px-2.5">
                  Text
                </ToggleGroupItem>
                <ToggleGroupItem value="text-voice" className="px-2.5">
                  Text + voice
                </ToggleGroupItem>
              </ToggleGroup>
              <AudioSettingsDialog
                enabled
                voiceVolume={voiceVolume}
                voiceMuted={voiceMuted}
                originalVolume={originalVolume}
                duckOriginal={duckOriginal}
                duckLevel={duckLevel}
                canDuckOriginal
                onVoiceVolume={setVoiceVolume}
                onVoiceMuted={setVoiceMuted}
                onOriginalVolume={setOriginalVolume}
                onDuckOriginal={setDuckOriginal}
                onDuckLevel={setDuckLevel}
              />
            </div>
          </div>
          <div className="session-toolbar-row session-toolbar-row--actions">
            <div className="status-line" role="status">
              <span className="status-dot" aria-hidden />
              <span>Listening</span>
            </div>
            <span className="session-timer">01:24</span>
            <div className="session-actions">
              <Button type="button" variant="outline" size="sm">
                Stop
              </Button>
              <Button type="button" className="session-primary">
                Pause
              </Button>
            </div>
          </div>
        </section>

        <section className="subtitle-stage transcript-stage" aria-label="Live transcript">
          <div className="subtitle-stage-head">
            <div className="subtitle-toggles">
              <span className="subtitle-pair">Korean → English</span>
              <div className="font-size-controls" role="group" aria-label="Text size">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={fontSize <= 14}
                  onClick={() => setFontSize((n) => Math.max(14, n - 2))}
                  aria-label="Decrease text size"
                >
                  A−
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={fontSize >= 28}
                  onClick={() => setFontSize((n) => Math.min(28, n + 2))}
                  aria-label="Increase text size"
                >
                  A+
                </Button>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={items.length === 0}
              title={items.length === 0 ? 'Nothing to clear yet' : 'Clear both transcript panels'}
              onClick={() => setConfirmClear(true)}
            >
              Clear both
            </Button>
          </div>
          <DualTranscriptPanel
            items={items}
            sourceLanguageName="Korean"
            targetLanguageName="English"
            sourceLangCode="ko"
            targetLangCode="en"
            fontSize={fontSize}
            empty={<div className="transcript-empty">No transcript</div>}
          />
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
