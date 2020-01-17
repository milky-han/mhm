"use strict";

const { introduce, build } = require("megaminx");

const fs = require("fs-extra");
const path = require("path");

const globalConfig = fs.readJsonSync(path.resolve(__dirname, "../../config.json"));

module.exports = async function makeFont(ctx, config, argv) {
	const b = await ctx.run(introduce, "b", { from: argv.main });

	const fw = globalConfig.width * 2;
	for (const gid in b.glyf) {
		const glyph = b.glyf[gid];
		if (!glyph) continue;
		if (glyph.advanceWidth) {
			const expected = Math.ceil(glyph.advanceWidth / fw) * fw;
			const delta = (expected - glyph.advanceWidth) / 2;
			glyph.advanceWidth = expected;
			for (let c of glyph.contours) for (let z of c) z.x += delta;
		} else {
			const commonHangulWidth = 920;
			for (let c of glyph.contours) for (let z of c) z.x -= (fw - commonHangulWidth) / 2;
		}
	}

	await ctx.run(build, "b", { to: argv.main });
};
