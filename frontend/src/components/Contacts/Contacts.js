import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ContactUpload from './ContactUpload';
import ContactList from './ContactList';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const Contacts = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, byStatus: {} });
  const [refresh, setRefresh] = useState(0);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/contacts?page=${page}&limit=50`);
      setContacts(response.data.contacts);
      setTotalPages(response.data.pagination?.pages || 1);
    } catch (error) {
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/contacts/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats');
    }
  }, []);

  useEffect(() => {
    fetchContacts();
    fetchStats();
  }, [fetchContacts, fetchStats, refresh]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/contacts/${id}`);
      toast.success('Contact deleted successfully');
      setRefresh((prev) => prev + 1);
    } catch (error) {
      toast.error('Failed to delete contact');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Contacts</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your email contacts</p>
        </div>
        <ContactUpload onUpload={() => setRefresh((prev) => prev + 1)} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Contacts</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
          <p className="text-2xl font-bold text-green-600">{stats.byStatus?.active || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Bounced</p>
          <p className="text-2xl font-bold text-red-600">{stats.byStatus?.bounced || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Unsubscribed</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.byStatus?.unsubscribed || 0}</p>
        </div>
      </div>

      <ContactList
        contacts={contacts}
        loading={loading}
        onDelete={handleDelete}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
};

export default Contacts;

