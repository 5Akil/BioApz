'use strict';
module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define('role', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role_name: DataTypes.STRING,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    // created_at: DataTypes.DATE,
    // modified_at: DataTypes.DATE,
  }, {
    // timestamps: false
  });
  Role.associate = function(models) {
    // associations can be defined here
  };
  return Role;
};