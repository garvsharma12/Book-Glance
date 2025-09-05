import { Link, useLocation } from "wouter";
import { ThemeToggle } from "../ui/ThemeToggle";
import DonationButton from "../ui/DonationButton";
import DonationModal from "../ui/DonationModal";
import { useState } from "react";

interface NavbarProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  toggleContact: () => void;
}

export default function Navbar({ sidebarOpen, toggleSidebar, toggleContact }: NavbarProps) {
  const [location] = useLocation();
  const [donationModalOpen, setDonationModalOpen] = useState(false);

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={toggleSidebar} className="mr-4 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="h-5 w-5"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </button>
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-7 w-7 text-gray-900 dark:text-white" 
                viewBox="0 0 24 24" 
                fill="none"
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
              </svg>
              <span className="text-lg font-medium text-gray-900 dark:text-white">BookGlance</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-4">
            <DonationButton 
              onClick={() => setDonationModalOpen(true)} 
              variant="small"
              className="hidden sm:flex"
            />
            <ThemeToggle />
            <button onClick={toggleContact} className="text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="h-5 w-5"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span className="hidden md:inline text-sm font-medium">Contact</span>
            </button>
          </div>
        </div>
      </header>
      
      {/* Sidebar Navigation - Notion-style */}
      <aside 
        className={`w-64 bg-white dark:bg-black border-r border-gray-200 dark:border-gray-800 fixed top-[57px] bottom-0 left-0 z-20 transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="h-full flex flex-col">
          <div className="p-2 flex-1 overflow-y-auto scrollbar-hide">
            <div className="space-y-4">
              <div>
                <ul className="space-y-1">
                  <li>
                    <Link href="/" className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md font-medium text-sm transition-colors duration-150 ${
                        location === '/' 
                          ? 'bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-200' 
                          : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}>
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="h-4 w-4"
                        >
                          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        <span>Home</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/books" className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md font-medium text-sm transition-colors duration-150 ${
                        location === '/books' 
                          ? 'bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-200' 
                          : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}>
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="h-4 w-4"
                        >
                          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                        </svg>
                        <span>Book Scanner</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/reading-list" className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-md font-medium text-sm transition-colors duration-150 ${
                        location === '/reading-list' 
                          ? 'bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-200' 
                          : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}>
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="h-4 w-4"
                        >
                          <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                        </svg>
                        <span>Reading List</span>
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Donation section at bottom of sidebar */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <DonationButton 
              onClick={() => setDonationModalOpen(true)} 
              variant="small"
              className="w-full justify-center"
            />
          </div>
        </nav>
      </aside>
      
      {/* Donation Modal */}
      <DonationModal 
        isOpen={donationModalOpen} 
        onClose={() => setDonationModalOpen(false)} 
      />
    </>
  );
}
