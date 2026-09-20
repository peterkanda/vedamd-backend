<?php

namespace VedaMD\CDS;

/**
 * Turns raw CDS Hooks cards into the flat, already-validated structure
 * the Twig template renders.
 *
 * Escaping is Twig's job; this class's job is ordering and trust:
 * urgent cards first, only http(s) source links, and a visible flag on
 * any recommendation whose underlying content is not yet approved.
 */
class CardPresenter
{
    private const INDICATOR_CLASSES = [
        'critical' => 'alert-danger',
        'warning' => 'alert-warning',
        'info' => 'alert-info',
    ];

    private const INDICATOR_ORDER = ['critical' => 0, 'warning' => 1, 'info' => 2];

    public function prepare(array $cards): array
    {
        $prepared = [];

        foreach ($cards as $card) {
            if (!is_array($card)) {
                continue;
            }
            $summary = trim((string) ($card['summary'] ?? ''));
            if ($summary === '') {
                continue;
            }

            $indicator = (string) ($card['indicator'] ?? 'info');
            if (!isset(self::INDICATOR_CLASSES[$indicator])) {
                $indicator = 'info';
            }

            $sourceUrl = (string) ($card['source']['url'] ?? '');
            $review = $card['extension']['http://vedamd.io/Card/recommendation']['reviewStatus'] ?? null;

            $prepared[] = [
                'summary' => $summary,
                'detail' => (string) ($card['detail'] ?? ''),
                'indicator' => $indicator,
                'cssClass' => self::INDICATOR_CLASSES[$indicator],
                'sourceLabel' => (string) ($card['source']['label'] ?? ''),
                'sourceUrl' => $this->isSafeUrl($sourceUrl) ? $sourceUrl : '',
                // Anything not approved is surfaced to the clinician as
                // provisional rather than rendered as settled guidance.
                'reviewStatus' => (is_string($review) && $review !== '' && $review !== 'approved')
                    ? strtoupper($review)
                    : '',
            ];
        }

        usort($prepared, static function (array $a, array $b): int {
            return (self::INDICATOR_ORDER[$a['indicator']] ?? 2)
                <=> (self::INDICATOR_ORDER[$b['indicator']] ?? 2);
        });

        return $prepared;
    }

    /** Only http(s) links are emitted — never javascript: or data:. */
    private function isSafeUrl(string $url): bool
    {
        if ($url === '') {
            return false;
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        return $scheme === 'http' || $scheme === 'https';
    }
}
