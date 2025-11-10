import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const Dashboard = () => {
  const [stats, setStats] = useState({
    contacts: 0,
    campaigns: 0,
    sent: 0,
    delivered: 0
  });
  const [recentCampaigns, setRecentCampaigns] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [contactsRes, campaignsRes, analyticsRes] = await Promise.all([
        axios.get(`${API_URL}/contacts/stats`),
        axios.get(`${API_URL}/campaigns?limit=5`),
        axios.get(`${API_URL}/analytics/overview`)
      ]);

      setStats({
        contacts: contactsRes.data.total || 0,
        campaigns: campaignsRes.data.pagination?.total || 0,
        sent: analyticsRes.data.stats?.sent || 0,
        delivered: analyticsRes.data.stats?.delivered || 0
      });

      setRecentCampaigns(campaignsRes.data.campaigns || []);

      // Prepare chart data
      if (analyticsRes.data.dailyStats) {
        const dailyData = analyticsRes.data.dailyStats.reduce((acc, item) => {
          const date = item._id.date;
          if (!acc[date]) {
            acc[date] = { date, sent: 0, delivered: 0, opened: 0 };
          }
          if (item._id.event === 'sent') acc[date].sent = item.count;
          if (item._id.event === 'delivered') acc[date].delivered = item.count;
          if (item._id.event === 'opened') acc[date].opened = item.count;
          return acc;
        }, {});
        setChartData(Object.values(dailyData).slice(-7));
      }
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Overview of your email automation platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-primary-100 dark:bg-primary-900 rounded-md p-3">
              <svg className="h-6 w-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-3-3h-4a3 3 0 00-3 3v2zM9 10a3 3 0 100-6 3 3 0 000 6zM5 18v-2a3 3 0 013-3h4a3 3 0 013 3v2H5z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Contacts</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{stats.contacts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-green-100 dark:bg-green-900 rounded-md p-3">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Campaigns</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{stats.campaigns}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-blue-100 dark:bg-blue-900 rounded-md p-3">
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Emails Sent</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{stats.sent}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-purple-100 dark:bg-purple-900 rounded-md p-3">
              <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Delivered</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{stats.delivered}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Email Activity (Last 7 Days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="sent" fill="#0ea5e9" />
              <Bar dataKey="delivered" fill="#10b981" />
              <Bar dataKey="opened" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Campaigns */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recent Campaigns</h2>
          <Link
            to="/campaigns/create"
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Create Campaign
          </Link>
        </div>
        <div className="p-6">
          {recentCampaigns.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">No campaigns yet. Create your first campaign!</p>
          ) : (
            <div className="space-y-4">
              {recentCampaigns.map((campaign) => (
                <Link
                  key={campaign._id}
                  to={`/campaigns/${campaign._id}`}
                  className="block p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{campaign.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{campaign.subject}</p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      campaign.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      campaign.status === 'sending' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      campaign.status === 'draft' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                  <div className="mt-2 flex space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Sent: {campaign.stats?.sent || 0}</span>
                    <span>Delivered: {campaign.stats?.delivered || 0}</span>
                    <span>Opened: {campaign.stats?.opened || 0}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

