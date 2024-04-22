// CoupServer.js
// This contains the server-side javascript object for CoupServer.

var CoupModel = require('./CoupModel');
var CoupController = require('./CoupController');

// This is the top-level JavaScript object for the game
function CoupServer(argv)
{
	let port = 6080;	//default value, can be overridden by command line
	let db_uri = null;	//By default, use an interally mocked db unless an external mongodb is specified
	if (argv.length > 2)
	{
		db_uri = argv[2];
	}
	if (argv.length > 3)
	{
		port = argv[3];
	}
	console.log("db_uri:", db_uri, "port:", port);
    this.model = new CoupModel(this, db_uri);
    this.controller = new CoupController(this);
    this.controller.start(port, this.model);
}

module.exports = new CoupServer(process.argv);
