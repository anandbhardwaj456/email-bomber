import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import toast from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [batches, setBatches] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchCampaign = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/campaigns/${id}`);
      setCampaign(response.data.campaign);
      setBatches(response.data.batches?.jobs || []);
    } catch (error) {
      toast.error('Failed to load campaign');
      navigate('/campaigns');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/analytics/campaign/${id}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics');
    }
  }, [id]);

  useEffect(() => {
    fetchCampaign();
    fetchAnalytics();

    // Connect to socket for real-time updates
    const socket = io(SOCKET_URL);
    socket.emit('join-campaign', id);

    socket.on('campaign-started', (data) => {
      if (data.campaignId === id) {
        setCampaign((prev) => prev ? { ...prev, status: 'sending', startedAt: data.startedAt } : prev);
        fetchCampaign();
        fetchAnalytics();
      }
    });

    socket.on('email-sent', (data) => {
      if (data.campaignId === id) {
        fetchCampaign();
        fetchAnalytics();
      }
    });

    socket.on('batch-completed', (data) => {
      if (data.campaignId === id) {
        fetchCampaign();
        fetchAnalytics();
      }
    });

    socket.on('campaign-completed', (data) => {
      if (data.campaignId === id) {
        setCampaign((prev) => prev ? { ...prev, status: 'completed', completedAt: new Date().toISOString() } : prev);
        fetchCampaign();
        fetchAnalytics();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchCampaign, fetchAnalytics, id]);

  // Polling while sending to keep UI fresh even if socket events are missed
  useEffect(() => {
    if (campaign?.status === 'sending') {
      const interval = setInterval(() => {
        fetchCampaign();
        fetchAnalytics();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [campaign?.status, fetchCampaign, fetchAnalytics]);

  const handleSend = async () => {
    if (!window.confirm('Are you sure you want to send this campaign?')) {
      return;
    }

    try {
      setSending(true);
      // Optimistically reflect sending state
      setCampaign((prev) => prev ? { ...prev, status: 'sending' } : prev);
      await axios.post(`${API_URL}/campaigns/${id}/send`);
      toast.success('Campaign queued for sending');
      fetchCampaign();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send campaign');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  const totalProgress = batches.reduce((acc, batch) => ({
    total: acc.total + batch.progress.total,
    sent: acc.sent + batch.progress.sent,
    failed: acc.failed + batch.progress.failed,
  }), { total: 0, sent: 0, failed: 0 });

  const progressPercent = totalProgress.total > 0 
    ? Math.round((totalProgress.sent / totalProgress.total) * 100) 
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <button
          onClick={() => navigate('/campaigns')}
          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 mb-4"
        >
          ← Back to Campaigns
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{campaign.name}</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">{campaign.subject}</p>
          </div>
          {campaign.status === 'draft' && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Campaign'}
            </button>
          )}
        </div>
      </div>

      {/* Status and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white capitalize">{campaign.status}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{campaign.stats?.total || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Sent</p>
          <p className="text-xl font-bold text-green-600">{campaign.stats?.sent || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Delivered</p>
          <p className="text-xl font-bold text-blue-600">{campaign.stats?.delivered || 0}</p>
        </div>
      </div>

      {/* Progress Bar */}
      {campaign.status === 'sending' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sending Progress</h3>
            <span className="text-sm text-gray-600 dark:text-gray-400">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
            <div
              className="bg-primary-600 h-4 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="mt-2 flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Sent: {totalProgress.sent} / {totalProgress.total}</span>
            <span>Failed: {totalProgress.failed}</span>
          </div>
        </div>
      )}

      {/* Campaign Details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Campaign Details</h2>
        <div className="space-y-2 text-sm">
          <div className="flex">
            <span className="font-medium text-gray-700 dark:text-gray-300 w-32">From:</span>
            <span className="text-gray-600 dark:text-gray-400">{campaign.fromName} &lt;{campaign.fromEmail}&gt;</span>
          </div>
          <div className="flex">
            <span className="font-medium text-gray-700 dark:text-gray-300 w-32">Reply-To:</span>
            <span className="text-gray-600 dark:text-gray-400">{campaign.replyTo || campaign.fromEmail}</span>
          </div>
          <div className="flex">
            <span className="font-medium text-gray-700 dark:text-gray-300 w-32">Subject:</span>
            <span className="text-gray-600 dark:text-gray-400">{campaign.subject}</span>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Email Body:</h3>
          <div 
            className="prose dark:prose-invert max-w-none border border-gray-200 dark:border-gray-700 rounded p-4"
            dangerouslySetInnerHTML={{ __html: campaign.bodyHtml || campaign.body }}
          />
        </div>
      </div>

      {/* Analytics */}
      {analytics && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Analytics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Opened</p>
              <p className="text-2xl font-bold text-purple-600">{analytics.stats?.events?.opened || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Clicked</p>
              <p className="text-2xl font-bold text-indigo-600">{analytics.stats?.events?.clicked || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Bounced</p>
              <p className="text-2xl font-bold text-red-600">{analytics.stats?.events?.bounced || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Failed</p>
              <p className="text-2xl font-bold text-orange-600">{analytics.stats?.events?.failed || 0}</p>
            </div>
          </div>
          {analytics.timeline && analytics.timeline.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="_id.date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#0ea5e9" name="Events" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Batches */}
      {batches.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Batches</h2>
          <div className="space-y-2">
            {batches.map((batch) => (
              <div key={batch.jobId} className="border border-gray-200 dark:border-gray-700 rounded p-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900 dark:text-white">Batch {batch.batchNumber}</span>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    batch.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    batch.status === 'processing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                  }`}>
                    {batch.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Progress: {batch.progress.sent} / {batch.progress.total} sent
                  {batch.progress.failed > 0 && (
                    <span className="text-red-600 ml-2">{batch.progress.failed} failed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignDetail;

