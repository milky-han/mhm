declare -A shsWeightMap
shsWeightMap=([extralight]=ExtraLight [light]=Light [normal]=Normal [regular]=Regular [medium]=Medium [bold]=Bold [heavy]=Heavy)

for weight in extralight light normal regular medium bold heavy
do
	shsWeight=${shsWeightMap[$weight]}
	old=cache/idh/$shsWeight.json
	new=cache/idh/$shsWeight-new.json

	for region in sc tc hc j k
	do
		python make/common/update-cache.py --override $old build/hf-$weight/cache.gz
		node node_modules/@chlorophytum/cli/bin/_startup hint --jobs 8 -c hinting-params/$shsWeight.json -h build/hf-$weight/cache.gz \
			build/hf-$weight/kanji-$region-$weight.otd /dev/null \
			build/hf-$weight/hangul-$region-$weight.otd /dev/null
		python make/common/update-cache.py $new build/hf-$weight/cache.gz
	done
	mv $new $old
done

7z a -t7z -mmt=on -ms=on -m0=LZMA:a=0:d=1536m:fb=273 out/idh-cache.7z cache/idh/
