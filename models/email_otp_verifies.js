'use strict';
module.exports = (sequelize, DataTypes) => {
  const EmailOtpVerifies = sequelize.define('email_otp_verifies', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type : DataTypes.INTEGER,
    user_id : DataTypes.INTEGER,
    email : DataTypes.STRING,
    otp : DataTypes.INTEGER,
    role_id : DataTypes.INTEGER,
    expire_at : {
      type : DataTypes.DATE
    },
    
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  EmailOtpVerifies.associate = function(models) {
    // associations can be defined here
    EmailOtpVerifies.belongsTo(models.user, {foreignKey: 'user_id'})

  };
  return EmailOtpVerifies;
};