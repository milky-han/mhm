import argparse
import json
import gzip

if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument('--override', action = 'store_true')
	parser.add_argument('old')
	parser.add_argument('new')
	args = parser.parse_args()

	try:
		with open(args.old, 'rb') as oldFile:
			old = json.loads(oldFile.read().decode())
	except FileNotFoundError:
		old = {}

	try:
		with gzip.open(args.new, 'rb') as newFile:
			new = json.loads(newFile.read().decode())
	except FileNotFoundError:
		new = {}

	old.update(new)
	data = json.dumps(old, separators = (',', ':')).encode()

	with open(args.old, 'wb') as oldFile:
		oldFile.write(data)

	if args.override:
		with gzip.open(args.new, 'wb') as newFile:
			newFile.write(data)
