const child_process = require("child_process");
child_process.execSync("yarn && yarn build", { stdio: "inherit", cwd: __dirname });

require("./dist/index");
