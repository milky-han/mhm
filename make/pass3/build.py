import math
import argparse

from fontTools.ttLib import TTFont, newTable, TTCollection, TTLibError
from fontTools.ttLib.tables.DefaultTable import DefaultTable

from types import SimpleNamespace
from fontTools.misc import sstruct
from fontTools.ttLib.tables._h_d_m_x import hdmxHeaderFormat

headFlagInstructionsMayAlterAdvanceWidth = 0x0010
ppemMin = 7
ppemMax = 60

# deprecated: too slow
def BuildHdmx(font):
	head_ = font['head']
	os_2_ = font['OS/2']
	hmtx_ = font['hmtx']

	head_.flags |= headFlagInstructionsMayAlterAdvanceWidth

	hdmx_ = newTable('hdmx')
	hdmx_.hdmx = {}

	upm = head_.unitsPerEm
	widthHw = os_2_.xAvgCharWidth
	for ppem in range(ppemMin, ppemMax + 1):
		ppemHw = widthHw * ppem / upm
		if type(ppemHw) == int:
			continue
		d, i = math.modf(ppemHw)
		if (d <= 1/3):
			ppemHw = int(i)
		else:
			ppemHw = int(i) + 1
		hdmx_.hdmx[ppem] = { name: math.ceil(width / widthHw) * ppemHw for name, (width, _) in hmtx_.metrics.items() }

	font['hdmx'] = hdmx_

def BuildRawHdmx(font):
	head_ = font['head']
	os_2_ = font['OS/2']
	maxp_ = font['maxp']
	hmtx_ = font['hmtx']

	head_.flags |= headFlagInstructionsMayAlterAdvanceWidth

	numGlyphs = maxp_.numGlyphs
	recordSize = 4 * ((2 + numGlyphs + 3) // 4)
	pad = (recordSize - 2 - numGlyphs) * b"\0"
	deviceRecords = []

	upm = head_.unitsPerEm
	widthHw = os_2_.xAvgCharWidth
	for ppem in range(ppemMin, ppemMax + 1):
		ppemHw = widthHw * ppem / upm
		if type(ppemHw) == int:
			continue
		d, i = math.modf(ppemHw)
		if (d <= 1/3):
			ppemHw = int(i)
		else:
			ppemHw = int(i) + 1

		widths = []
		for name in font.getGlyphOrder():
			width = hmtx_[name][0]
			widths.append(math.ceil(width / widthHw) * ppemHw)
		record = bytes([ ppem, max(widths) ] + widths) + pad
		deviceRecords.append(record)

	hdmxHeader = sstruct.pack(hdmxHeaderFormat, SimpleNamespace(version = 0, numRecords = len(deviceRecords), recordSize = recordSize))
	
	hdmx_ = DefaultTable('hdmx')
	hdmx_.data = hdmxHeader + b''.join(deviceRecords)
	font['hdmx'] = hdmx_

if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument('-i', '--input', required = True)
	parser.add_argument('-o', '--output', required = True)
	args = parser.parse_args()

	try:
		ttc = TTCollection(args.input, recalcBBoxes = False)
		for font in ttc:
			BuildRawHdmx(font)
		ttc.save(args.output)
	except TTLibError:
		font = TTFont(args.input, recalcBBoxes = False)
		BuildRawHdmx(font)
		font.save(args.output)
