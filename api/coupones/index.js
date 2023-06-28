var express = require('express')
var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config')
var commonConfig = require('../../config/common_config')
const {verifyToken} = require('../../config/token');

var storage = multer.diskStorage({ 
    destination: function (req, file, cb) {
      cb(null, 'public/')
    },
    filename: function (req, file, cb) {
      var fileExtension = file.mimetype.split('/')[1];
      cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
    }
})
  
var upload = multer({ storage: storage });

//upload image in AWS S3
const fileFilter = (req,file,cb) => {
  if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/png'){
    cb(null,true)
  }else{
    cb(new Error('You can upload only jpg, jpeg, png, gif files'),false);
  }
}
// Coupones Section START
var controller = require('./coupones.controller')

// Coupones Routes
router.post('/create', verifyToken, controller.create)
router.delete('/delete/:id', verifyToken,controller.delete)
router.post('/update',verifyToken,controller.update)
router.post('/user/apply',verifyToken,controller.applyCoupon)
router.post('/user/list',verifyToken,controller.getUserCouponList);
router.post('/business/list',verifyToken,controller.getBusinessCouponList);
router.delete('/user/remove/:id',verifyToken,controller.removeUserCoupon)
// Coupones Section END

module.exports = router;
