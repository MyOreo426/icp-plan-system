/**
 * 统一响应格式工具
 * 提供标准的API响应格式
 */

/**
 * 成功响应
 * @param {Object} res - Express响应对象
 * @param {*} data - 响应数据
 * @param {string} message - 成功消息
 * @returns {Object} 统一格式的响应对象
 */
function success(res, data = null, message = 'success') {
  return res.json({
    code: 200,
    message,
    data
  });
}

/**
 * 错误响应
 * @param {Object} res - Express响应对象
 * @param {number} code - 错误码
 * @param {string} message - 错误消息
 * @returns {Object} 统一格式的响应对象
 */
function error(res, code = 500, message = 'Internal server error') {
  return res.status(code).json({
    code,
    message,
    data: null
  });
}

/**
 * 分页响应
 * @param {Object} res - Express响应对象
 * @param {Array} list - 数据列表
 * @param {number} total - 总数
 * @param {number} page - 当前页
 * @param {number} pageSize - 每页条数
 */
function paginate(res, list, total, page = 1, pageSize = 50) {
  return res.json({
    code: 200,
    message: 'success',
    data: {
      list,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      }
    }
  });
}

module.exports = {
  success,
  error,
  paginate
};
