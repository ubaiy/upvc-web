<?php
// Zips a production build with forward slashes: php pack-web.php <dist folder> <zip>
[, $dist, $out] = $argv;
$dist = rtrim(str_replace(chr(92), '/', $dist), '/');
$zip = new ZipArchive;
if ($zip->open($out, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    fwrite(STDERR, "cannot create $out\n");
    exit(1);
}
$count = 0;
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dist, FilesystemIterator::SKIP_DOTS));
foreach ($files as $file) {
    if ($file->isDir()) {
        continue;
    }
    $zip->addFile($file->getPathname(), substr(str_replace(chr(92), '/', $file->getPathname()), strlen($dist) + 1));
    $count++;
}
$zip->close();
echo "packed $count files\n";
