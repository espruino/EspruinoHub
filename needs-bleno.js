// Returns nonzero exit code if bleno isn't needed
// Called by start.sh
var config = require("./lib/config.js");
config.init(); // Load configuration
if (config.http_proxy) {
  console.log("YES");
} else {
  console.log("NO");
  process.exit(1);
}
