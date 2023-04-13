'use strict';
module.exports = (sequelize, DataTypes) => {
  const Setting = sequelize.define('settings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id :  DataTypes.INTEGER,
    setting_key : DataTypes.STRING,
    setting_label : DataTypes.STRING,
    setting_value: DataTypes.TEXT,
    is_enable :{
      type: DataTypes.BOOLEAN,
      defaultValue:true
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
  }, {
    // timestamps: false
  });
  Setting.associate = function(models) {
    // associations can be defined here

  };
  return Setting;
};