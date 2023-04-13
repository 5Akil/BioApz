'use strict';
module.exports = (sequelize, DataTypes) => {
  const Cms = sequelize.define('cms_pages', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id : DataTypes.INTEGER,
    page_key : DataTypes.STRING,
    page_label : DataTypes.STRING,
    page_value: DataTypes.TEXT,
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
  Cms.associate = function(models) {
    // associations can be defined here
    Cms.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return Cms;
};