var express = require('express')

var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config');

const uploadImage = multer({ dest: 'combos/' });

var controller = require('./calendar.controller')

const {verifyToken} = require('../../config/token');

router.post('/create', verifyToken, uploadImage.array('images'), controller.CreateEvent)
router.post('/list', verifyToken, controller.GetAllEvents)
router.post('/update', verifyToken, uploadImage.array('images'), controller.UpdateEvent)
router.post('/removeImages', verifyToken, controller.removeImagesFromCombo);
router.delete('/delete/:id', verifyToken, controller.DeleteEvent)
router.get('/view/:id', verifyToken, controller.ViewEvent)
module.exports = router;
