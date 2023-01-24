var express = require('express');
var app = express();
var setRes = require('./response');
var path = require('path');
var resCode = require('./config/res_code_config');
var cron = require('cron');
var body_parser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var morgan = require('morgan');

// set morgan to log info about our requests for development use.
app.use(morgan('dev'));
app.use(express.static('./'));
// initialize body-parser to parse incoming parameters requests to req.body
app.use(body_parser.urlencoded({
  extended: true
}));
app.use(body_parser.json());

// app.use('/views', express.static(path.join(__dirname, 'views')))

var models = require('./models');
models.sequelize.sync().then(function () {
  console.log('database sync..');
  })

var router = express.Router();

app.use(function (req, res, next) {

  res.header("Access-Control-Allow-Origin", "*");

  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Authorization, Content-Type, Accept");

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  next();

});

// app.set('views', './views');
// app.set('view engine', 'ejs');

// route for Home-Page
// app.get('/', sessionCheck.sessionChecker, (req, res) => {
//   res.redirect('/login');
// });

app.get('/', (req, res) => {
  res.send("server is running...")
})

app.use(express.static('uploads'));

app.use('/api', router);

require('./route')(app);

app.use(function (req, res, next) {
  res.send(setRes(resCode.ResourceNotFound, null, true, 'Route not found.'));
});

app.use(function (err, req, res, next) {
  console.log('err status...', err.status);
  res.send(setRes(resCode.InternalServer, null, true, err.message));
});

// Handle 404 - Keep this as a last route
app.use((req, res) => {
  res.redirect('/404');
});

// require('./cron-job')(cron)

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


//firebase initialization
var admin = require("firebase-admin");
//	var serviceAccount = require("./bioapz-106c0-firebase-adminsdk-onfga-04682c17d2.json");
	var serviceAccount = require("./bioapz-372208-4929769f6e43.json");

	!admin.apps.length ? admin.initializeApp({
		credential: admin.credential.cert(serviceAccount),
		//databaseURL: "https://bioapz-56c76.firebaseio.com"
		//databaseURL: "https://bioapz-106c0-default-rtdb.firebaseio.com"
		databaseURL: "https://bioapz-372208-default-rtdb.firebaseio.com"

	}).firestore()
  : admin.app().firestore();

// firebase initialization over

var Queue = require('better-queue');
var notification = require('./push_notification')

	var db = admin.database()

	var userModel = models.user;
	var businessModel = models.business;

	var NotificationData = {};

	var NotificationRef = db.ref(`notifications`)

	var NotificationQueue = new Queue(function (task, cb) {
		if (task.role == 'customer'){
			userModel.findOne({
				where: {
					id: task.id,
					is_deleted: false
				}
			}).then(user => {
				if (user != null){
					NotificationData.device_token = user.device_token
					NotificationData.message = task.text
					NotificationData.title = task.from_name
					notification.SendNotification(NotificationData)
				}
			})
		}else{
			businessModel.findOne({
				where: {
					id: task.id,
					is_deleted: false
				}
			}).then(business => {
				if (business != null){
					NotificationData.device_token = business.device_token
					NotificationData.message = task.text
					NotificationData.title = task.from_name
					notification.SendNotification(NotificationData)
				}
			})
		}
		cb();
	})

	var RemoveDataQueue = new Queue(function (task, cb) {
		NotificationRef.child(task).remove();
		cb();
	})

	NotificationRef.on("child_added", function(snapshot) {

		snapshotVal = JSON.parse(JSON.stringify(snapshot.val()))
		snapshotKey = JSON.parse(JSON.stringify(snapshot.key))
		NotificationQueue.push(snapshotVal);
		RemoveDataQueue.push(snapshotKey)

	})

module.exports = app;