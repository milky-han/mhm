#!/usr/bin/env python

import sys
import subprocess

if __name__ == "__main__":
	subprocess.run(['otfccbuild', '--stub-cmap4'] + sys.argv[1:])
