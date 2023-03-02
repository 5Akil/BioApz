var express = require('express')

var router = express.Router()

var multer = require('multer');
const multerS3 = require('multer-s3');

const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config')
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/products')
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
    cb(new Error('Invalid image'),false);
  }
}

var awsupload = multer({
  storage:multerS3({
    fileFilter,
    s3:awsConfig.s3,
    bucket:'bioapz',
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'products/'+fileName);
    }
  })
})

var controller = require('./product.controller')

const {verifyToken} = require('../../config/token');

router.post('/inquiry', verifyToken, controller.createInquiry)
router.post('/getAll', verifyToken, controller.GetAllProducts)
router.post('/getBooking', verifyToken, controller.GetBookingInquiry)
router.post('/isRead', verifyToken, controller.IsReadStatus)
router.post('/updateProduct', verifyToken, awsupload.single('image'), controller.UpdateProductDetail)
// router.post('/initChat', verifyToken, controller.ChatInitialize)
router.post('/byId', verifyToken, controller.GetProductById)
router.post('/photo', verifyToken, awsupload.single('image'), (req, res) => {
  res.json({ message: 'File uploaded successfully',data:`${req.file.key}` });
});

module.exports = router;
