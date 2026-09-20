<?php

namespace VedaMD\CDS;

/**
 * Module configuration.
 *
 * Read from environment variables first (the right place for a secret
 * in a containerised OpenEMR) and from OpenEMR globals second, so an
 * administrator without shell access can still configure it.
 */
class Config
{
    public const GLOBAL_BASE_URL = 'vedamd_base_url';
    public const GLOBAL_API_KEY  = 'vedamd_api_key';
    public const GLOBAL_SERVICE  = 'vedamd_service_id';
    public const GLOBAL_SECTION  = 'vedamd_dashboard_section';

    private string $baseUrl;
    private string $apiKey;
    private string $serviceId;
    private string $section;
    private int $timeoutSeconds;

    public function __construct(array $globals = [], ?array $env = null)
    {
        $env = $env ?? $_ENV + $_SERVER;

        $this->baseUrl = rtrim(
            $env['VEDAMD_BASE_URL'] ?? $globals[self::GLOBAL_BASE_URL] ?? 'https://api.vedamd.io',
            '/'
        );
        $this->apiKey     = (string) ($env['VEDAMD_API_KEY'] ?? $globals[self::GLOBAL_API_KEY] ?? '');
        $this->serviceId  = $env['VEDAMD_SERVICE_ID'] ?? $globals[self::GLOBAL_SERVICE] ?? 'vedamd-order-select';
        // Dashboard section the VedaMD card is added to. demographics.php
        // dispatches exactly two: 'primary' and 'secondary'. Anything else
        // would silently never render, so it falls back to 'secondary'.
        $section = (string) ($globals[self::GLOBAL_SECTION] ?? 'secondary');
        $this->section = in_array($section, ['primary', 'secondary'], true) ? $section : 'secondary';
        // Kept short on purpose: the patient summary must render even
        // when VedaMD is slow or unreachable.
        $this->timeoutSeconds = (int) ($env['VEDAMD_TIMEOUT_SECONDS'] ?? 4);
    }

    public function isConfigured(): bool
    {
        return $this->apiKey !== '' && $this->baseUrl !== '';
    }

    public function getBaseUrl(): string
    {
        return $this->baseUrl;
    }

    public function getApiKey(): string
    {
        return $this->apiKey;
    }

    public function getServiceId(): string
    {
        return $this->serviceId;
    }

    public function getSection(): string
    {
        return $this->section;
    }

    public function getTimeoutSeconds(): int
    {
        return $this->timeoutSeconds;
    }
}
