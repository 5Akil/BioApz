'use strict';
module.exports = (sequelize, DataTypes) => {
  const Templates = sequelize.define('templates', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    category_id: {
        type: DataTypes.INTEGER,
    },
    name: DataTypes.STRING,
    template_url: DataTypes.STRING,
    description: DataTypes.TEXT,
    image: DataTypes.STRING,
    is_enable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    // timestamps: false
  });
  Templates.associate = function(models) {
    // associations can be defined here
    Templates.belongsTo(models.business_categorys, {foreignKey: 'category_id'})
    Templates.hasOne(models.business, {foreignKey: 'template_id'})
  };
  return Templates;
};