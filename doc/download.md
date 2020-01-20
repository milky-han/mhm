# Milky Han Mono: Download Guide

Download from [GitHub release page](https://github.com/milky-han/mhm/releases).

## Naming

### “Mono” and “Term”

“Mono” and “Term” only differ in name. The “Term” variant has no localized name.

| OpenType language tag | Mono           | Term           |
| --------------------- | -------------- | -------------- |
| en-US                 | Milky Han Mono | Milky Han Term |
| zh-CN                 | 星汉等宽       | Milky Han Term |
| zh-TW                 | 星漢等寬       | Milky Han Term |
| zh-HK                 | 星漢等寬       | Milky Han Term |
| ja-JP                 | 星漢等幅       | Milky Han Term |
| ko-KR                 | 성한 고정폭    | Milky Han Term |

### Regional orthography

- The `milky-cjk` archive: complete character set
  - `CL`: Classical orthography
  - `SC`, `TC`, `HC`, `J`, `K`: Regional orthography, following [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) notations.
- `milky-{cn,tw,hk,jp,kr}` archives: language-specific subset
  - `CN`, `TW`, `HK`, `JP`, `KR`: Regional orthography, following Source Han Sans notations.

### “Minimal” archives

Minimal archives (`milky-{cn,tw,hk,jp,kr}-minimal`) pack only 4 styles: Regular, Italic, Bold, and Bold Italic.

## Known issues

### Empty Unicode BMP CMap in TTC files

Some legacy apps (e.g. `conhost.exe`) will show no glyph in Milky Han Mono.

Workaround: install TTFs instead.

### The “Normal” and “Regular” weights confuse some apps

Workaround: do not install “Normal” and “Normal Italic” styles.

## Tweaks for Linux

### If you dislike ClearType-style hinting...

Set fontconfig’s [`hintstyle`](https://wiki.archlinux.org/index.php/Font_configuration#Hintstyle) to `hintslight` or `hintnone` globally, to enable sub-pixel positioning.

### If you enjoy ClearType-style hinting...

1. Append a string containing `DFKaiShu` to name, using [this script](snippet/add-DFKaiShu-to-name.py) ([fonttools](https://github.com/fonttools/fonttools) required). 

   For example,
   ```bash
   for font in ttf/milky-mono-sc-*.ttf
   do
     path/to/add-DFKaiShu-to-name.py -i $font -o ${font%.ttf}-hintfull.ttf
   done
   ```

2. Copy modified fonts to the font directory (i.e. `~/.fonts/`) and run `fc-cache`.

3. Set [`hintstyle`](https://wiki.archlinux.org/index.php/Font_configuration#Hintstyle) to `hintslight` for this font only.

   This step enables sub-pixel positioning. The font is still strongly hinted due to `DFKaiShu` in its name.

   For example,
   ```xml
   <?xml version='1.0'?>
   <!DOCTYPE fontconfig SYSTEM 'fonts.dtd'>
   <fontconfig>
     <match target="font">
       <edit mode="assign" name="hintstyle">
         <const>hintfull</const>
       </edit>
     </match>
     <match target="font"><!-- place this node AFTER global setting -->
       <test qual="any" name="family">
         <string>Mikly Han Mono SC (DFKaishu)</string>
       </test>
       <edit name="hintstyle">
         <const>hintslight</const>
       </edit>
     </match>
   </fontconfig>
   ```
