import { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from './config/api';
import './App.css';

export default function App() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [cveLoading, setCveLoading] = useState(false);
  const [cveResult, setCveResult] = useState(null);
  const [error, setError] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [osFilter, setOsFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isPatching, setIsPatching] = useState(false);
  const [patchingStatus, setPatchingStatus] = useState({});
  const [isUpdatingCVE, setIsUpdatingCVE] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);
  const [updateCVESummary, setUpdateCVESummary] = useState(null);
  const [singleKbPatchLoading, setSingleKbPatchLoading] = useState({});

  const fetchServers = async () => {
    setLoading(true);
    setError('');
    setCveResult(null);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.FETCH_OS_INFO), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (data.statusCode === 200) {
        const newServers = JSON.parse(data.body);
        setServers(newServers);
        // Giữ lại các server đã chọn nếu còn tồn tại
        setSelected((prevSelected) => {
          const newIds = newServers.map(s => s.InstanceId);
          return prevSelected.filter(id => newIds.includes(id));
        });
      } else {
        setError('Lỗi khi lấy danh sách server');
      }
    } catch (e) {
      setError('Lỗi kết nối API');
    }
    setLoading(false);
  };

  const handleSelect = (instanceId) => {
    setSelected((prev) =>
      prev.includes(instanceId)
        ? prev.filter((id) => id !== instanceId)
        : [...prev, instanceId]
    );
  };

  const handleParseCVE = async () => {
    setCveLoading(true);
    setError('');
    setCveResult(null);
    setCurrentPage(1); // Reset to first page when new data loads
    try {
      const os_versions = servers
        .filter((s) => selected.includes(s.InstanceId))
        .map((s) => s.NormalizedOS);
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.PARSE_CVE), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ os_versions }),
      });
      const data = await res.json();
      if (data.statusCode === 200) {
        // Parse the JSON string from the response
        const cveData = JSON.parse(data.body);
        setCveResult({
          os_versions,
          cveList: cveData
        });
      } else {
        setError('Lỗi khi lấy CVE');
      }
    } catch (e) {
      setError('Lỗi kết nối API');
    }
    setCveLoading(false);
  };

  const handleRunPatch = async () => {
    if (selected.length === 0) return;

    setIsPatching(true);
    setError('');
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.START_PATCH), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_ids: selected })
      });

      const data = await res.json();
      if (data.statusCode !== 200) throw new Error("Failed to start patch");

      console.log("Patch execution started:", data.body);

    } catch (e) {
      setError('Lỗi khi bắt đầu patch: ' + e.message);
      setIsPatching(false);
    }
  };

  useEffect(() => {
    if (!isPatching) return;

    const interval = setInterval(async () => {
      let allCompleted = true;

      for (const instanceId of selected) {
        try {
          const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.GET_STATUS), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: instanceId })
          });

          const data = await res.json();
          if (data.statusCode === 200) {
            const body = JSON.parse(data.body);
            setPatchingStatus(prev => ({
              ...prev,
              [instanceId]: body
            }));

            // Nếu vẫn còn chưa hoàn tất → tiếp tục polling
            if (body.percentage < 100) {
              allCompleted = false;
            }
          }
        } catch (err) {
          console.error('Lỗi polling status:', err);
        }
      }

      // Dừng polling nếu tất cả đều xong
      if (allCompleted) {
        clearInterval(interval);
        setIsPatching(false);
      }
    }, 20000); // mỗi 20s

    return () => clearInterval(interval);
  }, [isPatching]);

  // Handler for updating CVE
  const handleUpdateCVE = async () => {
    setIsUpdatingCVE(true);
    setError('');
    setUpdateCVESummary(null);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.UPDATE_CVE), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceIds: selected }),
      });
      const data = await res.json();
      if (data.statusCode === 200) {
        // Parse and show summary
        let parsed;
        try {
          parsed = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
        } catch (e) {
          parsed = null;
        }
        setUpdateCVESummary(parsed);
        fetchServers();
      } else {
        setError('Lỗi khi cập nhật CVE mới nhất');
      }
    } catch (e) {
      setError('Lỗi kết nối API khi cập nhật CVE');
    }
    setIsUpdatingCVE(false);
  };

  // Handler for rebooting servers
  const handleRebootServer = async () => {
    if (!selected || selected.length === 0) return;
    setIsRebooting(true);
    setError('');
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.REBOOT_SERVER), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_ids: selected }),
      });
      const data = await res.json();
      if (data.statusCode === 200) {
        // Optionally, show a success message or refresh data
        fetchServers();
      } else {
        setError('Lỗi khi reboot server');
      }
    } catch (e) {
      setError('Lỗi kết nối API khi reboot server');
    }
    setIsRebooting(false);
  };

  // Handler for running patch for a single KB
  const handleRunPatchSingleKB = async (instanceId, kb) => {
    setSingleKbPatchLoading(prev => ({ ...prev, [`${instanceId}_${kb}`]: true }));
    setError('');

    try {
      // 🔁 Gọi API chạy lại patch
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.START_PATCH_SINGLE_KB), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId, kb }),
      });

      const data = await res.json();

      // ✅ Gọi lại GET_STATUS ngay lập tức để update UI
      const statusRes = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.GET_STATUS), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId }),
      });

      const statusData = await statusRes.json();
      if (statusData.statusCode === 200) {
        const parsed = JSON.parse(statusData.body);

        setPatchingStatus(prev => ({
          ...prev,
          [instanceId]: parsed,
        }));

        // ⏱ Nếu tiến độ chưa đạt 100%, bật polling lại
        if (parsed.percentage < 100) {
          setIsPatching(true);
        }
      }
    } catch (e) {
      console.error(e);
      setError('Lỗi khi chạy lại patch KB');
    }

    setSingleKbPatchLoading(prev => ({ ...prev, [`${instanceId}_${kb}`]: false }));
  };

  const selectedCount = selected.length;
  const totalCount = servers.length;

  // Get unique severities and OS types for filters
  const getUniqueSeverities = () => {
    if (!cveResult?.cveList) return [];
    return [...new Set(cveResult.cveList.map(cve => cve.severity))];
  };

  const getUniqueOSTypes = () => {
    if (!cveResult?.cveList) return [];
    return [...new Set(cveResult.cveList.map(cve => cve.PK.split('#')[1]))];
  };

  // Filter CVE data based on selected filters
  const getFilteredCVE = () => {
    if (!cveResult?.cveList) return [];
    
    return cveResult.cveList.filter(cve => {
      const severityMatch = severityFilter === 'all' || cve.severity === severityFilter;
      const osMatch = osFilter === 'all' || cve.PK.split('#')[1] === osFilter;
      return severityMatch && osMatch;
    });
  };

  const filteredCVE = getFilteredCVE();
  const uniqueSeverities = getUniqueSeverities();
  const uniqueOSTypes = getUniqueOSTypes();

  // Pagination logic
  const totalPages = Math.ceil(filteredCVE.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedCVE = filteredCVE.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'important': return 'bg-orange-100 text-orange-800';
      case 'moderate': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getBaseScoreColor = (score) => {
    const numScore = parseFloat(score);
    if (numScore >= 9.0) return 'bg-red-100 text-red-800';
    if (numScore >= 7.0) return 'bg-orange-100 text-orange-800';
    if (numScore >= 4.0) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900">Autopatch Security: CI/CD based automated patching architecture for banking systems</h1>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={fetchServers}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang quét...
                  </>
                ) : (
                  <>
                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Quét Server
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Lỗi</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {servers.length > 0 && (
          <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M9 16h.01" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Tổng Server</dt>
                      <dd className="text-lg font-medium text-gray-900">{totalCount}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Đã Chọn</dt>
                      <dd className="text-lg font-medium text-gray-900">{selectedCount}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">CVE Found</dt>
                      <dd className="text-lg font-medium text-gray-900">{cveResult ? cveResult.cveList.length : 0}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Servers Table */}
        {servers.length > 0 && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Danh sách Server</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">Thông tin chi tiết về các server trong hệ thống</p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-500">
                    {selectedCount} / {totalCount} đã chọn
                  </span>
                  <button
                    onClick={() => setSelected(selected.length === servers.length ? [] : servers.map(s => s.InstanceId))}
                    className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                  >
                    {selected.length === servers.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input 
                        type="checkbox" 
                        checked={selected.length === servers.length && servers.length > 0}
                        onChange={(e) => setSelected(e.target.checked ? servers.map(s => s.InstanceId) : [])}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operating System</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AMI</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {servers.map((server) => (
                    <tr key={server.InstanceId} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selected.includes(server.InstanceId)}
                          onChange={() => handleSelect(server.InstanceId)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M9 16h.01" />
                              </svg>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 font-mono">{server.InstanceId}</div>
                            <div className="text-sm text-gray-500">Active</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{server.NormalizedOS}</div>
                        <div className="text-sm text-gray-500">{server.PlatformVersion}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {server.IPAddress}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="max-w-xs truncate" title={server.AmiName}>
                          {server.AmiName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(server.FetchedAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
      </div>

            <div className="px-4 py-4 sm:px-6 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center gap-3">
              {/* Update CVE Button */}
              <button
                onClick={handleUpdateCVE}
                disabled={isUpdatingCVE || selected.length === 0}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isUpdatingCVE ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang cập nhật CVE...
                  </>
                ) : (
                  <>
                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16m16-8H4" />
                    </svg>
                    Cập nhật CVE mới nhất ({selectedCount} server)
                  </>
                )}
              </button>
              {/* Phân tích CVE Button */}
              <button
                onClick={handleParseCVE}
                disabled={selected.length === 0 || cveLoading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {cveLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang phân tích...
                  </>
                ) : (
                  <>
                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Phân tích CVE ({selectedCount} server)
                  </>
                )}
              </button>
              {/* Run Patch Button */}
              <button
                onClick={handleRunPatch}
                disabled={selected.length === 0 || !cveResult || isPatching}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50"
              >
                {isPatching ? 'Đang chạy...' : `Run Patch KB (${selectedCount})`}
              </button>
              {/* Reboot Server Button - only show if patching is complete and at least one server is selected */}
              {!isPatching && cveResult && selected.length > 0 && (
                <button
                  onClick={handleRebootServer}
                  disabled={isRebooting || selected.length === 0}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {isRebooting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Đang reboot server...
                    </>
                  ) : (
                    <>
                      <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16m16-8H4" />
                      </svg>
                      Reboot {selectedCount} server
                    </>
                  )}
                </button>
              )}
            </div>
            {/* Show Update CVE Summary if available */}
            {updateCVESummary && (
              <div className="w-full mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Kết quả cập nhật CVE</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm mb-2">
                    <thead>
                      <tr className="bg-blue-100">
                        <th className="px-3 py-2 text-left font-medium text-blue-700">Instance ID</th>
                        <th className="px-3 py-2 text-left font-medium text-blue-700">OS Name</th>
                        <th className="px-3 py-2 text-left font-medium text-blue-700">Total Fetched</th>
                        <th className="px-3 py-2 text-left font-medium text-blue-700">Filtered Processed</th>
                        <th className="px-3 py-2 text-left font-medium text-blue-700">Saved to DynamoDB</th>
                        <th className="px-3 py-2 text-left font-medium text-blue-700">Errors</th>
                        <th className="px-3 py-2 text-left font-medium text-blue-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {updateCVESummary.summary && updateCVESummary.summary.map((item, idx) => (
                        <tr key={idx} className="border-b last:border-b-0 hover:bg-blue-100">
                          <td className="px-3 py-2 font-mono text-blue-900">{item.instanceId}</td>
                          <td className="px-3 py-2">{item.osName}</td>
                          <td className="px-3 py-2">{item.totalFetched}</td>
                          <td className="px-3 py-2">{item.filteredProcessed}</td>
                          <td className="px-3 py-2">{item.savedToDynamoDB}</td>
                          <td className="px-3 py-2">{item.errors}</td>
                          <td className="px-3 py-2 font-semibold">{item.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {updateCVESummary.timeRange && (
                    <div className="text-xs text-blue-700 mt-2">
                      <span className="font-semibold">Thời gian:</span> {updateCVESummary.timeRange.start} → {updateCVESummary.timeRange.end}
                    </div>
                  )}
                </div>
              </div>
            )}
            
          </div>
        )}

        {/* CVE Results */}
        {cveResult && (
          <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Kết quả phân tích CVE</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    OS versions: <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">{cveResult.os_versions.join(', ')}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="px-4 py-4 sm:px-6 bg-gray-50 border-b border-gray-200">
              <div className="flex flex-wrap items-center space-x-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Mức độ:</label>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="ml-2 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="all">Tất cả</option>
                    {uniqueSeverities.map(severity => (
                      <option key={severity} value={severity}>{severity}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">OS:</label>
                  <select
                    value={osFilter}
                    onChange={(e) => setOsFilter(e.target.value)}
                    className="ml-2 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="all">Tất cả</option>
                    {uniqueOSTypes.map(os => (
                      <option key={os} value={os}>{os}</option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-gray-500">
                  Hiển thị {filteredCVE.length} / {cveResult.cveList.length} CVE
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CVE Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Impact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OS</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KB Article</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Release Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedCVE.map((cve, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 font-mono">{cve.cveNumber}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(cve.severity)}`}>
                          {cve.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBaseScoreColor(cve.baseScore)}`}>
                          {cve.baseScore}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{cve.impact}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{cve.PK.split('#')[1]}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{cve.kbArticle}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(cve.releaseDate).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredCVE.length > 0 && (
              <div className="px-4 py-4 sm:px-6 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">Hiển thị:</label>
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                        className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                      <span className="text-sm text-gray-500">mỗi trang</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Hiển thị {startIndex + 1} đến {Math.min(endIndex, filteredCVE.length)} trong tổng số {filteredCVE.length} CVE
                    </div>
                  </div>
                  {/* Dynamic Pagination Numbers */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {(() => {
                      let startPage = Math.max(1, currentPage - 2);
                      let endPage = Math.min(totalPages, currentPage + 2);
                      if (endPage - startPage < 4) {
                        if (startPage === 1) {
                          endPage = Math.min(totalPages, startPage + 4);
                        } else if (endPage === totalPages) {
                          startPage = Math.max(1, endPage - 4);
                        }
                      }
                      const pageNumbers = [];
                      for (let i = startPage; i <= endPage; i++) {
                        pageNumbers.push(i);
                      }
                      return pageNumbers.map(page => (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === page
                              ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      ));
                    })()}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {Object.entries(patchingStatus).map(([instanceId, status]) => (
        <div key={instanceId} className="mt-8 p-6 border border-gray-200 rounded-xl bg-white shadow-md">
          <div className="flex items-center mb-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          <div>
          <h4 className="text-base font-semibold text-gray-800 mb-1">
            Server <span className="font-mono text-indigo-700">{instanceId}</span>
          </h4>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Tiến độ:</span>
          <div className="w-40 bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${status.percentage}%` }}
            ></div>
          </div>
          <span className="text-xs font-semibold text-green-700">{status.percentage}%</span>
        </div>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm mt-4">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">KB</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
          </tr>
        </thead>
                <tbody>
                  {status.details.map((kb, idx) => (
                    <tr key={idx} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-indigo-700">KB{kb.KB}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold space-x-1
                            ${(kb.Status === 'Success' || kb.Status === 'Already Installed') ? 'bg-green-100 text-green-700' :
                              kb.Status === 'Failed' ? 'bg-red-100 text-red-700' :
                              kb.Status === 'not available' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-yellow-100 text-yellow-700'}`}
                          >
                            {(kb.Status === 'Success' || kb.Status === 'Already Installed') && (
                              <svg className="w-4 h-4 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {kb.Status === 'Failed' && (
                              <svg className="w-4 h-4 mr-1 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                            {kb.Status === 'Not Available' && (
                              <svg className="w-4 h-4 mr-1 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                              </svg>
                            )}
                            {kb.Status !== 'Success' && kb.Status !== 'Failed' && kb.Status !== 'Already Installed' && kb.Status !== 'Not Available' && (
                              <svg className="w-4 h-4 mr-1 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                              </svg>
                            )}
                            <span>{kb.Status}</span>
                          </span>
                          {kb.RebootRequired && (
                            <span
                              title="Reboot required"
                              className="text-xs text-red-600 bg-red-100 rounded px-2 py-0.5 font-semibold flex items-center"
                            >
                              🔁 Reboot
                            </span>
                          )}
                          {/* Button Run Patch KB nếu status là Failed */}
                          {kb.Status === 'Failed' && (
                            <button
                              onClick={() => handleRunPatchSingleKB(instanceId, kb.KB)}
                              disabled={singleKbPatchLoading[`${instanceId}_${kb.KB}`]}
                              className="ml-2 inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
                            >
                              {singleKbPatchLoading[`${instanceId}_${kb.KB}`] ? (
                                <svg className="animate-spin h-4 w-4 mr-1 text-white" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : null}
                              Retry Run Patch KB
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {servers.length === 0 && !loading && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M9 16h.01" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có server nào</h3>
            <p className="mt-1 text-sm text-gray-500">Nhấn "Quét Server" để bắt đầu</p>
          </div>
        )}
      </div>
    </div>
  );
}
