var FCM = require('fcm-node');

//send firebase push notification to Android & IOS devices
module.exports.SendNotification = (req) =>{
    return new Promise(function(resolve, reject) {
        console.log('+++++++++++++++++++In Notification Module+++++++++++++++++++')
        //firebase server key
        //var serverKey = "AAAAt81rXUE:APA91bEh_yck1LjH2KbCYfFgr54ferL8EFtdn5_JOIQMmRW6bqfLe0luI8NMLmfQmm1hEIG4qHjCXqI8NAWIytOO3uxkRovXDbP9FQOGBRhjENi2UkVgy87Q4Dyxip8aba04xN4GmMJ8";
        var serverKey = "AAAAc9YLpS8:APA91bGUPSktxgDxwGZpbDI2VMM6h1bhF5yFNw8rvip6vgPiVYCF-Ut2oOpXzoM5eOjMw0naY6lUsMn9bk8prUbmy4xELnu3FiyB7B6UeexyM3sbsasxNnXJTw4HHnTmxy2fKUCGxgKZ";
// var serverKey = "AIzaSyClU1O9FUSTDtFPkq5CDsv4KpfjnJVxgG0"; 

        
        var fcm = new FCM(serverKey);

        var MessageTitle;
        req.title != null ? MessageTitle = req.title : MessageTitle = 'BioApz' 

        const message = {
            ...(typeof(req.device_token) == 'string' ? { to: req.device_token } : { registration_ids: req.device_token }),
            // to: 'daJGid1NabI:APA91bEZbgejvjbfqcgXG_XTyPrdrJgC3KQk3RfDolWqSgfWezT17WX_OY8tMiDG3jdlp8SZ2uYj57yEj_M6mXlWaPjqqpMBTZmZRQkZf2_Z3t0cposs1HhKJJ67jEVS_m4WqaOr7cnj',
            collapse_key: 'green',
            notification: {
                title: MessageTitle,
                body: req.message
            },
            data: req.content
        };

        fcm.send(message, function(FCMerr, response){
            console.log("=========err========");
            console.log(FCMerr);
            console.log("=========result========");
            console.log(response);
            console.log('========message===========');
            console.log(message)
            resolve(message)
        });
    })
}