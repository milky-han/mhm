#! /usr/bin/env python3

# Usage:
#   ./add-DFKaiShu-to-name.py -i <input.ttf/ttc> -o <output.ttf/ttc>

import argparse

from fontTools.ttLib import TTFont, TTCollection, TTLibError

def ModifyName(font):
	name_ = font['name']
	for entry in name_.names:
		if entry.nameID in [ 1, 3, 4, 16, 18, 21 ]:
			entry.string = (entry.toUnicode() + " (DFKaiShu)").encode(entry.getEncoding())
		if entry.nameID in [ 6, 20 ]:
			entry.string = (entry.toUnicode() + "-DFKaiShu").encode(entry.getEncoding())

if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument('-i', '--input', required = True)
	parser.add_argument('-o', '--output', required = True)
	args = parser.parse_args()

	try:
		ttc = TTCollection(args.input, recalcBBoxes = False)
		for font in ttc:
			ModifyName(font)
		ttc.save(args.output)
	except TTLibError:
		font = TTFont(args.input, recalcBBoxes = False)
		ModifyName(font)
		font.save(args.output)
