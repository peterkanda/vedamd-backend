<?php

/**
 * Bootstrap for the VedaMD clinical decision support module.
 *
 * Loaded by OpenEMR's module loader, which injects $classLoader and
 * $eventDispatcher into this scope.
 *
 * @package   oe-module-vedamd-cds
 * @license   https://github.com/openemr/openemr/blob/master/LICENSE GNU General Public License 3
 */

namespace VedaMD\CDS;

use OpenEMR\Core\OEGlobalsBag;

/**
 * @var \OpenEMR\Core\ModulesClassLoader $classLoader
 */
$classLoader->registerNamespaceIfNotExists('VedaMD\\CDS\\', __DIR__ . DIRECTORY_SEPARATOR . 'src');

/**
 * @var \Symfony\Component\EventDispatcher\EventDispatcherInterface $eventDispatcher
 */
$bootstrap = new Bootstrap($eventDispatcher, OEGlobalsBag::getInstance()->getKernel());
$bootstrap->subscribeToEvents();
