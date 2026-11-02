<?php
// One-shot on the server, sent by deploy-web.sh: replaces the Angular files only, then deletes itself.
header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex');
set_time_limit(120);
ini_set('display_errors', '1');

const RELEASE = '__RELEASE__';
const SITE_FOLDER = 'lightgray-opossum-416780.hostingersite.com';

$web = __DIR__;
$root = dirname($web);
$tmp = $root.'/_webrel';

function rrmdir(string $dir): void
{
    if (! is_dir($dir)) {
        return;
    }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) {
        $item->isDir() && ! $item->isLink() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($dir);
}

try {
    // Never on any other site of the account
    if (basename($root) !== SITE_FOLDER || ! is_dir($root.'/upvc-api')) {
        throw new RuntimeException('this is not the UPVC site, nothing changed');
    }
    $zip = new ZipArchive;
    if ($zip->open($web.'/'.RELEASE) !== true) {
        throw new RuntimeException('cannot open the release, nothing changed');
    }
    $count = $zip->numFiles;
    $zip->extractTo($tmp);
    $zip->close();
    if (! file_exists($tmp.'/index.html')) {
        throw new RuntimeException('the release has no index.html, nothing changed');
    }

    // index.html last, so the page never names a file that is not there yet
    $copied = 0;
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS));
    foreach ($items as $item) {
        $rel = substr(str_replace(chr(92), '/', $item->getPathname()), strlen($tmp) + 1);
        if ($rel === 'index.html') {
            continue;
        }
        $to = $web.'/'.$rel;
        if (! is_dir(dirname($to))) {
            mkdir(dirname($to), 0755, true);
        }
        if (! copy($item->getPathname(), $to)) {
            throw new RuntimeException("cannot copy $rel, index.html not changed");
        }
        $copied++;
    }
    if (! copy($tmp.'/index.html', $web.'/index.html')) {
        throw new RuntimeException('cannot copy index.html');
    }

    $removed = 0;
    foreach (glob($web.'/*.{js,css}', GLOB_BRACE) ?: [] as $file) {
        if (! file_exists($tmp.'/'.basename($file))) {
            unlink($file);
            $removed++;
        }
    }
    echo "entries $count, copied $copied, old bundles removed $removed\n";

    foreach (['index.php', '.htaccess', 'storage', 'assets/logo/logo-large.png'] as $kept) {
        if (! file_exists($web.'/'.$kept)) {
            throw new RuntimeException("$kept is missing from the web root");
        }
    }
    echo "server files kept\n";
} catch (Throwable $e) {
    echo 'FAILED: ', $e->getMessage(), "\n";
} finally {
    rrmdir($tmp);
    if (file_exists($web.'/'.RELEASE)) {
        unlink($web.'/'.RELEASE);
    }
    unlink(__FILE__);
    echo "installer removed\n";
}
