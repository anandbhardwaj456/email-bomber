import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const Campaigns = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const url = `${API_URL}/campaigns?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}`;
      const response = await axios.get(url);
      setCampaigns(response.data.campaigns);
      setTotalPages(response.data.pagination?.pages || 1);
    } catch (error) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/campaigns/${id}`);
      toast.success('Campaign deleted successfully');
      fetchCampaigns();
    } catch (error) {
      toast.error('Failed to delete campaign');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Campaigns</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your email campaigns</p>
        </div>
        <Link
          to="/campaigns/create"
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          Create Campaign
        </Link>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sending">Sending</option>
          <option value="completed">Completed</option>
          <option value="paused">Paused</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        {campaigns.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">No campaigns found</p>
            <Link
              to="/campaigns/create"
              className="inline-block px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Create Your First Campaign
            </Link>
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div
              key={campaign._id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <Link
                      to={`/campaigns/${campaign._id}`}
                      className="text-xl font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {campaign.name}
                    </Link>
                    <span
                      className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        campaign.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : campaign.status === 'sending'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : campaign.status === 'draft'
                          ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          : campaign.status === 'failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <p className="mt-2 text-gray-600 dark:text-gray-400">{campaign.subject}</p>
                  <div className="mt-4 flex space-x-6 text-sm text-gray-500 dark:text-gray-400">
                    <span>Total: {campaign.stats?.total || 0}</span>
                    <span>Sent: {campaign.stats?.sent || 0}</span>
                    <span>Delivered: {campaign.stats?.delivered || 0}</span>
                    <span>Opened: {campaign.stats?.opened || 0}</span>
                    <span>Clicked: {campaign.stats?.clicked || 0}</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Link
                    to={`/campaigns/${campaign._id}`}
                    className="px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(campaign._id)}
                    className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center">
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600"
            >
              Previous
            </button>
            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};

export default Campaigns;

