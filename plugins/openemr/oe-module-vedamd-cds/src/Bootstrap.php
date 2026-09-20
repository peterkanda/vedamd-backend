<?php

namespace VedaMD\CDS;

use OpenEMR\Events\Core\TwigEnvironmentEvent;
use OpenEMR\Events\Patient\Summary\Card\CardModel;
use OpenEMR\Events\Patient\Summary\Card\SectionEvent;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;
use Twig\Loader\FilesystemLoader;

/**
 * Wires the module into OpenEMR's event dispatcher.
 *
 * Two listeners, both verified against interface/patient_file/summary/
 * demographics.php:
 *
 *  1. TwigEnvironmentEvent::EVENT_CREATED — registers templates/ with
 *     OpenEMR's Twig loader so the card template resolves.
 *
 *  2. SectionEvent::EVENT_HANDLE ('section.render') — contributes a
 *     VedaMD card to a dashboard section. demographics.php dispatches
 *     SectionEvent('primary') and SectionEvent('secondary'), then renders
 *     each card through its own template with the card frame variables.
 *
 * An earlier version appended to a "medications" card via RenderEvent.
 * OpenEMR never dispatches a card event with that id — the medication
 * card is rendered directly — so the module installed cleanly and never
 * showed anything. Contributing a card of our own avoids depending on a
 * core card's internal id at all.
 */
class Bootstrap
{
    public const CARD_ID = 'vedamd_cds';

    private EventDispatcherInterface $dispatcher;
    private Config $config;
    private ?VedaMdClient $client;
    private ?PatientContextBuilder $contextBuilder;
    private CardPresenter $presenter;

    public function __construct(
        EventDispatcherInterface $dispatcher,
        $kernel = null,
        ?Config $config = null,
        ?VedaMdClient $client = null,
        ?PatientContextBuilder $contextBuilder = null
    ) {
        $this->dispatcher = $dispatcher;
        $this->config = $config ?? new Config($GLOBALS);
        $this->client = $client;
        $this->contextBuilder = $contextBuilder;
        $this->presenter = new CardPresenter();
    }

    public function subscribeToEvents(): void
    {
        $this->dispatcher->addListener(
            TwigEnvironmentEvent::EVENT_CREATED,
            [$this, 'registerTemplatePath']
        );
        $this->dispatcher->addListener(
            SectionEvent::EVENT_HANDLE,
            [$this, 'onSectionRender']
        );
    }

    public function registerTemplatePath(TwigEnvironmentEvent $event): void
    {
        $loader = $event->getTwigEnvironment()->getLoader();
        if ($loader instanceof FilesystemLoader) {
            $loader->prependPath(dirname(__DIR__) . DIRECTORY_SEPARATOR . 'templates');
        }
    }

    public function onSectionRender(SectionEvent $event): void
    {
        if ($event->getSection() !== $this->config->getSection()) {
            return;
        }
        if (!$this->config->isConfigured()) {
            return;
        }

        $pid = $this->currentPatientId();
        if ($pid === null) {
            return;
        }

        try {
            $context = $this->contextBuilder()->build($pid);
            if (empty($context['medications'])) {
                // Every rule behind the configured service is a prescribing
                // or chart check that needs at least one medication.
                return;
            }

            $cards = $this->presenter->prepare($this->client()->evaluate($context));
            if ($cards === []) {
                // No card at all rather than an empty box on the dashboard.
                return;
            }

            $event->addCard(new CardModel([
                'dispatcher' => $this->dispatcher,
                'identifier' => self::CARD_ID,
                'title' => 'VedaMD Decision Support',
                // demographics.php checks this with AclMain::aclCheckCore
                // and skips the card when it fails — same gate as the
                // core medical cards.
                'acl' => ['patients', 'med'],
                'add' => false,
                'edit' => false,
                'collapse' => true,
                'initiallyCollapsed' => false,
                'templateFile' => 'vedamd/cards.html.twig',
                'templateVariables' => ['cards' => $cards],
            ]));
        } catch (\Throwable $e) {
            // Decision support must never take the chart down with it.
            error_log('vedamd: dashboard card failed — ' . get_class($e));
        }
    }

    /** The patient whose chart is open, per OpenEMR's session. */
    private function currentPatientId(): ?int
    {
        $pid = $_SESSION['pid'] ?? null;
        if ($pid === null || !is_numeric($pid) || (int) $pid <= 0) {
            return null;
        }
        return (int) $pid;
    }

    private function client(): VedaMdClient
    {
        return $this->client ??= new VedaMdClient($this->config);
    }

    private function contextBuilder(): PatientContextBuilder
    {
        return $this->contextBuilder ??= new PatientContextBuilder();
    }
}
