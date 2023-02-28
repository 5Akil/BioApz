var express = require('express')

var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')

var companyImages = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/images')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})

var upload =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/offers')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})

var banner =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/banners')
      },
      filename: function (req, file, cb) {
        // var fileExtension = file.mimetype.split('/')[1];
        // cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
        cb(null, `${file.originalname}`)
      }
    })
})

const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: 'AKIA6EW533LXXRNVFAPW',
  secretAccessKey: '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',
  region: 'us-east-1'
});

const s3 = new AWS.S3();

const fileFilter = (req,file,cb) => {

  if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/png'){
    cb(null,true)
  }else{
    cb(new Error('Invalid image'),false);
  }
}

var awsupload = multer({
  storage:multerS3({
    fileFilter,
    s3:s3,
    bucket:'bioapz',
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'offers/'+fileName);
    }
  })
})

var awsuploadcompanyImages = multer({
  storage:multerS3({
    fileFilter,
    s3:s3,
    bucket:'bioapz',
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'images/'+fileName);
    }
  })
})

var awsuploadbanner = multer({
  storage:multerS3({
    fileFilter,
    s3:s3,
    bucket:'bioapz',
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'banners/'+fileName);
    }
  })
})
var controller = require('./business.controller')

const {verifyToken} = require('../../config/token');

router.post('/inquiry', verifyToken, controller.createInquiry)
router.post('/recommended', verifyToken, controller.GetRecommendedBusiness)
router.post('/getBusinessDetail', verifyToken, controller.GetBusinessDetail);
router.post('/updateBusinessDetail', verifyToken, controller.UpdateBusinessDetail)
router.post('/getImages', verifyToken, controller.GetImages);
router.post('/uploadImages', verifyToken, awsuploadcompanyImages.array('images'), controller.UploadCompanyImages)
router.post('/getAll', verifyToken, controller.GetAllOffers)
router.post('/updateOffers', verifyToken, awsupload.single('image'), controller.UpdateOfferDetail)
router.post('/banner_booking', verifyToken , awsuploadbanner.single('banner'), controller.ManageBannerAndBooking);
router.post('/register', controller.CreateBusiness)
router.post('/initChat', verifyToken, controller.ChatInitialize)

router.post('/createOffer', verifyToken, awsupload.single('image'), controller.CreateOffer)
router.post('/updateOffer', verifyToken, awsupload.single('image'), controller.UpdateOffer)
router.post('/getOffers', verifyToken, controller.GetOffers)
//booking api for react restaurants templates
router.post('/restaurants-booking', verifyToken, controller.RestaurantsBooking)

module.exports = router;
