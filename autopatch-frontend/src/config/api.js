export const API_CONFIG = {
  BASE_URL: 'https://xioac2avy5.execute-api.us-east-1.amazonaws.com/prod',
  ENDPOINTS: {
    FETCH_OS_INFO: '/fetch-os-info',
    PARSE_CVE: '/parse-cve',
    START_PATCH: '/start-patch',
    GET_STATUS: '/get-patch-status',
    UPDATE_CVE: '/update-cve',
    REBOOT_SERVER: '/reboot-server',
    START_PATCH_SINGLE_KB: '/start-patch-single-kb',
  }
};

export const getApiUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
}; 