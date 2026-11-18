import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Plus,
  QrCode,
  Printer,
  Shield,
  Clock,
  Phone,
  Mail,
  MapPin,
  Calendar,
  X,
  CreditCard,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { Member, MembershipType, MemberStatus, UserRole } from '../types/library';

interface MembersPageProps {
  userRole: UserRole;
}

export const MembersPage: React.FC<MembersPageProps> = ({ userRole }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // New member modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newType, setNewType] = useState<MembershipType>('Standard');

  // Digital card modal
  const [cardMember, setCardMember] = useState<Member | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const data = await LibraryService.getMembers();
      setMembers(data);
    } catch (err) {
      console.error('Error fetching members:', err);
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      m.full_name.toLowerCase().includes(q) ||
      m.member_code.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.phone && m.phone.includes(q));

    const matchesTier = tierFilter === 'all' || m.membership_type === tierFilter;
    return matchesSearch && matchesTier;
  });

  const handleRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail) return;

    setActionError(null);
    try {
      await LibraryService.addMember({
        full_name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        address: newAddress.trim(),
        registration_date: new Date().toISOString().split('T')[0],
        membership_expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        membership_type: newType,
        status: 'Active',
      });

      setShowAddModal(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewAddress('');
      await loadMembers();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleToggleStatus = async (member: Member) => {
    const nextStatus: MemberStatus = member.status === 'Active' ? 'Suspended' : 'Active';
    setActionError(null);
    try {
      await LibraryService.updateMember(member.id, { status: nextStatus });
      await loadMembers();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DE] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2C221E] font-sans">
            Library Member Management
          </h1>
          <p className="text-xs text-[#7E6F64]">
            Register patrons, manage membership credentials, and issue digital member cards.
          </p>
        </div>

        {userRole !== 'Member' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register New Member</span>
          </button>
        )}
      </div>

      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E8E2D9] shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#A89F91] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member by name, code (MEM-...), or email..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg focus:outline-hidden focus:border-[#c62828]"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#F2EDE4] p-1 rounded-lg text-xs overflow-x-auto">
          {['all', 'Standard', 'Student', 'Faculty', 'VIP'].map((tier) => (
            <button
              key={tier}
              onClick={() => setTierFilter(tier)}
              className={`px-3 py-1 font-medium rounded-md transition-colors whitespace-nowrap ${
                tierFilter === tier ? 'bg-white text-[#2C221E] shadow-2xs' : 'text-[#7E6F64] hover:text-[#2C221E]'
              }`}
            >
              {tier === 'all' ? 'All Tiers' : tier}
            </button>
          ))}
        </div>
      </div>

      {/* Members Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs text-[#7E6F64]">
            Loading library members...
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs bg-white border border-[#E8E2D9] rounded-2xl p-8 max-w-lg mx-auto">
            <Users className="w-10 h-10 mx-auto text-[#A89F91] mb-2" />
            <h4 className="text-sm font-bold text-[#2C221E] mb-1">
              {members.length === 0 ? 'No Library Members Registered' : 'No members found'}
            </h4>
            <p className="text-xs text-[#7E6F64] mb-4">
              {members.length === 0
                ? 'Register patrons to create and manage digital library membership cards.'
                : 'No members match your current search query.'}
            </p>
            {members.length === 0 && userRole !== 'Member' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs"
              >
                Register First Member
              </button>
            )}
          </div>
        ) : (
          filteredMembers.map((member) => (
            <div
              key={member.id}
              className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs flex flex-col justify-between hover:border-[#D4CDC3] transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#fce4e4] border border-[#c62828]/30 flex items-center justify-center text-[#c62828] font-bold text-sm">
                      {member.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-[#2C221E]">{member.full_name}</h3>
                      <span className="font-mono text-[10px] text-[#c62828] font-semibold">
                        {member.member_code}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                      member.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {member.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-[#5A4D44] pt-2 border-t border-[#F0ECE4]">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-[#A89F91]" />
                    <span className="truncate">{member.email}</span>
                  </div>
                  {member.phone && (
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <Phone className="w-3.5 h-3.5 text-[#A89F91]" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                  {member.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#A89F91]" />
                      <span className="truncate">{member.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F0ECE4] flex items-center justify-end text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCardMember(member)}
                    className="p-1.5 text-[#7E6F64] hover:text-[#c62828] hover:bg-[#FAF8F5] rounded-md transition-colors"
                    title="View Digital Member Card"
                  >
                    <CreditCard className="w-4 h-4" />
                  </button>
                  {userRole !== 'Member' && (
                    <button
                      onClick={() => handleToggleStatus(member)}
                      className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                        member.status === 'Active'
                          ? 'text-rose-700 hover:bg-rose-50'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {member.status === 'Active' ? 'Suspend' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Register Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#E5E0D8] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAE5DE] pb-3">
              <h3 className="text-sm font-bold text-[#2C221E]">Register Library Member</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#7E6F64] hover:text-[#2C221E]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterMember} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Eleanor Vance"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="eleanor.vance@example.com"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+62 812 0000 0000"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                    Membership Tier
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as MembershipType)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Student">Student</option>
                    <option value="Faculty">Faculty</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Mailing Address
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Street, City, State"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-[#F0ECE4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-[#7E6F64] hover:text-[#2C221E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs"
                >
                  Create Member Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Digital Member Card Modal */}
      {cardMember && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-[#E5E0D8] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAE5DE] pb-2">
              <h3 className="text-sm font-bold text-[#2C221E]">Digital Library Card</h3>
              <button onClick={() => setCardMember(null)} className="text-[#7E6F64] hover:text-[#2C221E]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vintage Elegant Library Card */}
            <div className="relative aspect-1.58/1 rounded-xl bg-gradient-to-br from-[#2C221E] via-[#3D312A] to-[#1F1713] text-white p-4 shadow-md flex flex-col justify-between overflow-hidden border border-[#5A4D44]/30">
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[9px] uppercase tracking-widest text-[#fca5a5] font-semibold">
                    MeelieFont Library Patron
                  </span>
                  <h4 className="text-sm font-bold text-white tracking-wide mt-0.5">
                    {cardMember.full_name}
                  </h4>
                </div>
                <span className="text-[10px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-[#fca5a5]">
                  {cardMember.membership_type}
                </span>
              </div>

              {/* Card Middle barcode representation */}
              <div className="py-2">
                <div className="font-mono text-xs tracking-widest text-center text-[#E5E0D8]">
                  ||||| | |||| | ||||| || ||| | |||
                </div>
                <div className="text-center font-mono text-xs text-white/90 font-bold tracking-widest mt-1">
                  {cardMember.member_code}
                </div>
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between text-[9px] text-[#A89F91] font-mono border-t border-white/10 pt-2">
                <span>Joined: {cardMember.registration_date}</span>
                <span>Expires: {cardMember.membership_expiration_date || '2027'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCardMember(null)}
                className="px-3 py-1.5 text-xs text-[#7E6F64] hover:text-[#2C221E]"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Card</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
