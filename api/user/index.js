var express = require('express')

var router = express.Router()
var multer = require('multer');
const uuidv1 = require('uuid/v1');
const moment = require('moment')

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/profile_picture')
    },
    filename: function (req, file, cb) {
      // var fileExtension = file.mimetype.split('/')[1];
      // cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      cb(null, `${file.originalname}`)
    }
  })
  
  var upload = multer({ storage: storage });

var controller = require('./user.controller')

const {verifyToken} = require('../../config/token');

router.post('/register', controller.Register)
router.post('/login', controller.Login)
router.post('/forgotPassword', controller.forgotPassword);
router.get('/resetPassword/:token', controller.GetResetPasswordForm);
router.post('/update-password/:token', controller.UpdatePassword)
router.get('/account-activation/:token', controller.AccountActivationByToken)
router.post('/get-profile', verifyToken, controller.GetProfileDetail)
router.post('/update-profile', verifyToken, upload.single('profile_picture'), controller.UpdateProfile)
router.post('/change-password', verifyToken, controller.ChangePassword)
router.post('/feedback', verifyToken, controller.SendFeedback)

module.exports = router;
