<?php

namespace VedaMD\CDS;

/**
 * Thin CDS Hooks client.
 *
 * Uses cURL directly rather than pulling a HTTP library into OpenEMR's
 * dependency tree — one fewer thing for a site admin to keep patched.
 *
 * Failure policy: every error path returns an empty card list. The
 * patient summary must render whether or not VedaMD is reachable, and
 * a decision-support outage is not a reason to block a clinician from
 * seeing the chart. Errors are recorded for the operator via the
 * supplied logger, never shown as a scary banner to the clinician.
 */
class VedaMdClient
{
    private Config $config;
    /** @var callable|null */
    private $logger;

    public function __construct(Config $config, ?callable $logger = null)
    {
        $this->config = $config;
        $this->logger = $logger;
    }

    /**
     * Invokes a CDS Hooks service.
     *
     * @param array $context VedaMD flat clinical context
     * @return array List of cards; empty on any failure.
     */
    public function evaluate(array $context): array
    {
        if (!$this->config->isConfigured()) {
            $this->log('vedamd: not configured — set VEDAMD_API_KEY');
            return [];
        }

        $payload = [
            // Match the hook to the configured service so VedaMD's feedback
            // and audit trail attribute cards to the right workflow point.
            'hook' => $this->hookFor($this->config->getServiceId()),
            'hookInstance' => $this->uuid4(),
            'context' => $context,
        ];

        $url = $this->config->getBaseUrl() . '/cds-services/' . rawurlencode($this->config->getServiceId());

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->config->getTimeoutSeconds(),
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: Bearer ' . $this->config->getApiKey(),
            ],
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body === false || $error !== '') {
            // Log the failure class only — the request body is PHI.
            $this->log('vedamd: request failed (' . $error . ')');
            return [];
        }

        if ($status !== 200) {
            $this->log('vedamd: HTTP ' . $status . ' from ' . $this->config->getServiceId());
            return [];
        }

        $decoded = json_decode((string) $body, true);
        if (!is_array($decoded) || !isset($decoded['cards']) || !is_array($decoded['cards'])) {
            $this->log('vedamd: unexpected response shape');
            return [];
        }

        return $decoded['cards'];
    }

    /** "vedamd-order-select" → "order-select"; unknown ids fall back to patient-view. */
    private function hookFor(string $serviceId): string
    {
        $known = ['patient-view', 'order-select', 'order-sign', 'medication-prescribe'];
        $hook = preg_replace('/^vedamd-/', '', $serviceId);
        return in_array($hook, $known, true) ? $hook : 'patient-view';
    }

    private function log(string $message): void
    {
        if ($this->logger !== null) {
            ($this->logger)($message);
        } elseif (function_exists('error_log')) {
            error_log($message);
        }
    }

    private function uuid4(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
