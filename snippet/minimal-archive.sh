version=$(cat package.json | python -c "import sys, json; print(json.load(sys.stdin)['version'])")

cd out/
for region in cn tw hk jp kr
do
  rm milky-$region-minimal-$version.7z
  7z a -t7z -mmt=on -ms=on -m0=LZMA:a=0:d=512m:fb=273 \
    milky-$region-minimal-$version.7z \
    ttf/milky-{mono,term}-$region-{regular,italic,bold,bolditalic}.ttf \
    ttc/milky-$region-{regular,italic,bold,bolditalic}.ttc
done
