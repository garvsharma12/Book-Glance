import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import StarRating from "@/components/ui/star-rating";
import DonationButton from "@/components/ui/DonationButton";
import DonationModal from "@/components/ui/DonationModal";

import AffiliateDisclosure from "@/components/ui/affiliate-disclosure";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Recommendation {
  id?: number;
  title: string;
  author: string;
  coverUrl: string;
  rating: string;
  summary: string;
  matchScore?: number;
  matchReason?: string;
  alreadyRead?: boolean;
  isBookRecommendation?: boolean;
  isBookYouveRead?: boolean;
  originalReadTitle?: string;
  fromShelf?: boolean;
  matchedFrom?: 'author' | 'book' | null;
  matchedTerm?: string | null;
}

interface RecommendationsStepProps {
  recommendations: Recommendation[];
  isLoading?: boolean;
  goodreadsData?: any[];
}

export default function RecommendationsStep({ recommendations, isLoading = false, goodreadsData }: RecommendationsStepProps) {
  const [savingBookIds, setSavingBookIds] = useState<number[]>([]);
  const [savedBookIds, setSavedBookIds] = useState<number[]>([]);
  const [expandedBooks, setExpandedBooks] = useState<number[]>([]);
  const [donationModalOpen, setDonationModalOpen] = useState(false);
  const { toast } = useToast();
  
  // Toggle expanded state of a book description
  const toggleExpand = (id: number) => {
    setExpandedBooks(prev => 
      prev.includes(id) 
        ? prev.filter(bookId => bookId !== id) 
        : [...prev, id]
    );
  };

  // Build a stable map from title+author to original index for consistent identity across filtered sections
  const titleAuthorToOriginalIndex = new Map<string, number>();
  recommendations.forEach((rec, i) => {
    titleAuthorToOriginalIndex.set(`${rec.title}-${rec.author}`, i);
  });

  // Fetch saved books when component mounts to know which books are already saved
  useEffect(() => {
    const fetchSavedBooks = async () => {
      try {
        const response = await fetch('/api/saved-books');
        if (!response.ok) {
          throw new Error('Failed to fetch saved books');
        }
        const data = await response.json();
        const savedBooks = Array.isArray(data) ? data : (data?.books || []);
        const alreadySaved: number[] = [];
        savedBooks.forEach((saved: {title: string, author: string}) => {
          if (!saved?.title || !saved?.author) return;
            const key = `${saved.title}-${saved.author}`;
            const idx = titleAuthorToOriginalIndex.get(key);
            if (typeof idx === 'number') alreadySaved.push(idx);
        });
        setSavedBookIds(alreadySaved);
      } catch (error) {
        console.log("Error fetching saved books:", error);
      }
    };

    if (recommendations.length > 0) {
      fetchSavedBooks();
    }
  }, [recommendations, titleAuthorToOriginalIndex]);

  // Function to toggle saving/removing a book from the reading list
  const toggleBookSave = async (book: Recommendation, originalIndex: number) => {
    const isCurrentlySaved = savedBookIds.includes(originalIndex);
    
    try {
      // Add book ID to loading state
  setSavingBookIds(prev => [...prev, originalIndex]);
      
      if (isCurrentlySaved) {
        // Remove book from saved list
        // First, get all saved books to find the correct ID
        const response = await fetch('/api/saved-books');
        if (!response.ok) {
          throw new Error('Failed to fetch saved books');
        }
  const data = await response.json();
  // Normalize saved books across both possible response shapes
  const savedBooks = Array.isArray(data) ? data : (data?.books || []);
        
        // Find the book to remove by title and author
        const bookToRemove = savedBooks.find((saved: {title: string, author: string}) => 
          saved.title === book.title && saved.author === book.author
        );
        
        if (bookToRemove) {
          // Get deviceId from cookies
          const deviceId = document.cookie
            .split('; ')
            .find(row => row.startsWith('deviceId='))
            ?.split('=')[1];
            
          const deleteResponse = await fetch(`/api/saved-books?bookId=${bookToRemove.id}&deviceId=${deviceId}`, {
            method: 'DELETE'
          } as RequestInit);
          
          if (!deleteResponse.ok) {
            throw new Error('Failed to remove book');
          }
          
          // Update local state
          setSavedBookIds(prev => prev.filter(id => id !== originalIndex));
          
          toast({
            title: "Book removed",
            description: `"${book.title}" has been removed from your reading list.`,
            variant: "default",
          });
        }
      } else {
        // Save book to reading list
        // Get deviceId from cookies
        const deviceId = document.cookie
          .split('; ')
          .find(row => row.startsWith('deviceId='))
          ?.split('=')[1];
          
        const saveResponse = await fetch('/api/saved-books', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl,
            rating: book.rating,
            summary: book.summary,
            deviceId: deviceId,
          }),
        } as RequestInit);

        if (!saveResponse.ok) {
          throw new Error('Failed to save book');
        }

        // Update local state
  setSavedBookIds(prev => [...prev, originalIndex]);
        
        toast({
          title: "Book saved!",
          description: (
            <div>
              <p className="mb-2">"{book.title}" has been added to your reading list.</p>
              <a 
                href="/reading-list" 
                className="text-orange-600 hover:text-orange-800 underline"
                onClick={() => {
                  // Close the toast when clicking the link
                  toast({ title: "", description: "", variant: "default" });
                }}
              >
                View reading list
              </a>
            </div>
          ),
          variant: "default",
        });
      }
    } catch (error) {
      console.log("Error toggling book save:", error);
      toast({
        title: "Error",
        description: `Failed to ${isCurrentlySaved ? 'remove' : 'save'} book. Please try again.`,
        variant: "destructive",
      });
    } finally {
      // Remove book ID from loading state
  setSavingBookIds(prev => prev.filter(id => id !== originalIndex));
    }
  };

  // Function to check if a book has already been read based on Goodreads data
  const isBookAlreadyRead = (book: Recommendation): boolean => {
    if (!goodreadsData || !Array.isArray(goodreadsData) || goodreadsData.length === 0) {
      return false;
    }
    
    const bookTitle = book.title.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const bookAuthor = book.author.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    // Check if this book appears in the user's Goodreads history
    return goodreadsData.some(goodreadsBook => {
      if (!goodreadsBook["Title"] || !goodreadsBook["Author"]) {return false;}
      
      // Only consider books that have been read (have a rating)
      if (!goodreadsBook["My Rating"] || parseInt(goodreadsBook["My Rating"]) === 0) {return false;}
      
      const goodreadsTitle = goodreadsBook["Title"].toLowerCase().replace(/[^\w\s]/g, '').trim();
      const goodreadsAuthor = goodreadsBook["Author"].toLowerCase().replace(/[^\w\s]/g, '').trim();
      
      // Check for partial title match and author match
      const titleMatch = bookTitle.includes(goodreadsTitle) || goodreadsTitle.includes(bookTitle);
      const authorMatch = bookAuthor.includes(goodreadsAuthor) || goodreadsAuthor.includes(bookAuthor);
      
      // Match on title OR a combination of partial title and author
      return titleMatch || (bookTitle.length > 3 && goodreadsTitle.includes(bookTitle) && authorMatch);
    });
  };
  
  // Function to render star ratings using our shared StarRating component
  const renderRating = (rating: string) => {
    // Handle potential empty or invalid ratings
    if (!rating || isNaN(parseFloat(rating))) {
      return <span className="text-sm text-neutral-500">No rating available</span>;
    }
    
    return (
      <StarRating 
        rating={rating} 
        starSize={4} 
        showNumeric={true} 
        className="text-neutral-600" 
      />
    );
  };

  // Derive sections: shelfBooks and newPicks
  // Shelf books: explicitly fromShelf === true OR legacy items with no matchedFrom and (fromShelf undefined)
  const shelfBooks = recommendations.filter(b => b.fromShelf === true || (!b.matchedFrom && b.fromShelf === undefined));
  // New picks: explicit external markers OR fromShelf === false
  const newPicks = recommendations.filter(b => b.fromShelf === false || !!b.matchedFrom);

  return (
    <div className="pb-12">
      {/* Affiliate Disclosure */}
      <div className="mb-4">
        <AffiliateDisclosure className="mb-0" />
      </div>
      
  <h3 className="text-lg font-semibold mb-4">Book Matches Based on Your Preferences</h3>
      <p className="text-slate-400 mb-4">
        We've analyzed the books in your photo and matched them against your reading preferences.
        Here are the books that best match your taste.
      </p>
      
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 flex">
                <Skeleton className="w-24 h-36 rounded-md" />
                <div className="ml-4 space-y-2 flex-1">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}
      
      {!isLoading && recommendations.length === 0 && (
        <div className="text-center py-10">
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
            className="h-12 w-12 text-neutral-400 dark:text-neutral-500 mx-auto mb-4"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            No recommendations available yet. Try scanning some books first!
          </p>
          <Button onClick={() => window.location.reload()}>Start Over</Button>
        </div>
      )}
      
      {!isLoading && recommendations.length > 0 && (
        <div className="space-y-12">
          {/* Check if all books have been read */}
          {recommendations.every(book => isBookAlreadyRead(book)) ? (
            <div className="text-center py-16 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-8 shadow-sm border border-orange-200">
              <div className="h-20 w-20 mx-auto mb-4 text-orange-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2 text-orange-800">You've read all these books!</h3>
              <p className="text-orange-600 mb-6">Great job! All the books we detected in your photo are already in your reading history. Try scanning a different bookshelf or ask friends for their recommendations.</p>
              <Button 
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => window.location.reload()}
              >
                Scan More Books
              </Button>
            </div>
          ) : (
            <div>
              {/* From your shelf */}
              <div>
                <h3 className="text-xl font-semibold mb-2 text-slate-800 dark:text-slate-200">From your shelf</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-4 text-sm">Books we detected in your photo that match your preferences.</p>
                <div className="grid grid-cols-1 gap-6">
                  {shelfBooks
                    .filter(book => !isBookAlreadyRead(book) && !book.isBookYouveRead)
                    .map((book) => {
                      const originalIndex = titleAuthorToOriginalIndex.get(`${book.title}-${book.author}`) ?? 0;
                      return (
                      <div 
                        key={originalIndex} 
                        className="bg-gray-100 dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="md:flex">
                          <div className="p-5 flex md:flex-col md:items-center md:w-1/4 md:border-r border-slate-200 dark:border-slate-700">
                            {book.coverUrl ? (
                              <div className="relative">
                                <img 
                                  src={book.coverUrl} 
                                  alt={book.title}
                                  className="w-24 h-36 md:w-32 md:h-48 object-cover rounded-md shadow-sm"
                                  onError={(e) => {
                                    // If image fails to load, replace with a secure proxy URL or fallback
                                    const target = e.target as HTMLImageElement;
                                    // Try using a CORS proxy if the original URL fails
                                    if (target.src === book.coverUrl) {
                                      // Create a fallback URL that uses HTTPS
                                      const fallbackUrl = book.coverUrl.replace('http://', 'https://');
                                      target.src = fallbackUrl;
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 rounded-md shadow-inner"></div>
                              </div>
                            ) : (
                              <div className="w-24 h-36 md:w-32 md:h-48 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center rounded-md shadow-sm">
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
                                  className="h-8 w-8 text-slate-400"
                                >
                                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                                </svg>
                              </div>
                            )}
                            
                            <div className="ml-5 md:ml-0 md:mt-4 md:text-center md:w-full flex flex-col md:items-center">
                              <div className="mt-3 flex items-center">
                                {renderRating(book.rating)}
                              </div>
                              
                              {book.matchScore !== undefined && book.matchScore >= 60 && (
                                <span className={`mt-2 text-xs font-medium px-2 py-0.5 rounded ${
                                  book.matchScore >= 90 ? "bg-green-100 text-green-800" :
                                  book.matchScore >= 76 ? "bg-blue-100 text-blue-800" :
                                  book.matchScore >= 60 ? "bg-yellow-100 text-yellow-800" : ""
                                }`}>
                                  {book.matchScore >= 90 ? "Great match" : 
                                   book.matchScore >= 76 ? "Good match" : 
                                   book.matchScore >= 60 ? "Fair match" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="md:w-3/4 flex flex-col">
                            <div className="p-5 pb-3">
                              <h4 className="font-semibold text-black dark:text-white text-xl mb-1">{book.title}</h4>
                              <p className="text-black dark:text-gray-300 text-sm mb-3">by {book.author}</p>
                              
                              {/* Display reason why recommended (with fallback if missing) */}
                              <div className="mt-2 mb-3 text-sm bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 p-3 rounded-md border border-orange-100 dark:border-orange-800">
                                <p className="text-orange-800 dark:text-orange-300 font-medium mb-1">Why we recommend it</p>
                                <p className="text-orange-700 dark:text-orange-400">
                                  {(() => {
                                    const reason = (book.matchReason || '').trim();
                                    const normalized = reason
                                      .replace(/using fallback algo/gi, '')
                                      .replace(/the user's/gi, 'your')
                                      .replace(/user has/gi, 'you have')
                                      .replace(/user likes/gi, 'you like')
                                      .replace(/user enjoys/gi, 'you enjoy')
                                      .replace(/user is/gi, 'you are')
                                      .replace(/user will/gi, 'you will')
                                      .replace(/user/gi, 'you')
                                      .trim();
                                    if (normalized) {return normalized;}
                                    if (typeof book.matchScore === 'number') {
                                      if (book.matchScore >= 90) return 'It’s an excellent match for your selected authors and genres.';
                                      if (book.matchScore >= 75) return 'It aligns well with your preferred authors and genres.';
                                      if (book.matchScore >= 60) return 'It fits parts of your reading preferences.';
                                    }
                                    return 'It matches your reading preferences and history.';
                                  })()}
                                </p>
                              </div>
                              <div className="text-sm text-black dark:text-gray-300">
                                <p className={expandedBooks.includes(originalIndex) ? '' : 'line-clamp-3'}>
                                  {book.summary}
                                </p>
                                {book.summary && book.summary.length > 240 && (
                                  <button 
                                    onClick={() => toggleExpand(originalIndex)}
                                    className="mt-2 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-sm flex items-center font-medium"
                                  >
                                    {expandedBooks.includes(originalIndex) ? (
                                      <>
                                        <ChevronUp className="h-4 w-4 mr-1" /> 
                                        Read Less
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-4 w-4 mr-1" /> 
                                        Read More
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            <div className="mt-auto p-5 pt-3 border-t border-slate-200 dark:border-slate-700">
                              <div className="flex justify-between gap-3">
                                <button 
                                  className={`
                                    ${savedBookIds.includes(originalIndex) 
                                      ? 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/40' 
                                      : 'bg-white dark:bg-gray-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-300'} 
                                    text-sm font-medium flex items-center px-3 py-1 rounded ${savingBookIds.includes(originalIndex) ? 'opacity-50 cursor-not-allowed' : ''}
                                  `}
                                  onClick={() => toggleBookSave(book, originalIndex)}
                                  disabled={savingBookIds.includes(originalIndex)}
                                >
                                  {savingBookIds.includes(originalIndex) ? (
                                    <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  ) : (
                                    <svg 
                                      xmlns="http://www.w3.org/2000/svg" 
                                      className="h-4 w-4 mr-1.5" 
                                      fill={savedBookIds.includes(originalIndex) ? "currentColor" : "none"}
                                      viewBox="0 0 24 24" 
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                                    </svg>
                                  )}
                                  {savedBookIds.includes(originalIndex) ? 'Saved to List' : 'Save for Later'}
                                </button>
                                <a 
                                  href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium"
                                >
                                  Buy on Amazon
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                </div>
              </div>

              {/* New picks for you */}
              <div className="mt-10">
                <h3 className="text-xl font-semibold mb-2 text-amber-700">New picks for you</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-4 text-sm">Fresh recommendations based on your favorite authors and books.</p>
                <div className="grid grid-cols-1 gap-6">
                  {newPicks
                    .filter(book => !isBookAlreadyRead(book) && !book.isBookYouveRead)
                    .map((book) => {
                      const originalIndex = titleAuthorToOriginalIndex.get(`${book.title}-${book.author}`) ?? 0;
                      return (
                      <div 
                        key={`new-${originalIndex}`} 
                        className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="md:flex">
                          <div className="p-5 flex md:flex-col md:items-center md:w-1/4 md:border-r border-slate-200 dark:border-slate-700">
                            {book.coverUrl ? (
                              <div className="relative">
                                <img 
                                  src={book.coverUrl} 
                                  alt={book.title}
                                  className="w-24 h-36 md:w-32 md:h-48 object-cover rounded-md shadow-sm"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    if (target.src === book.coverUrl) {
                                      const fallbackUrl = book.coverUrl.replace('http://', 'https://');
                                      target.src = fallbackUrl;
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 rounded-md shadow-inner"></div>
                              </div>
                            ) : (
                              <div className="w-24 h-36 md:w-32 md:h-48 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center rounded-md shadow-sm">
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
                                  className="h-8 w-8 text-slate-400"
                                >
                                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                                </svg>
                              </div>
                            )}
                            <div className="ml-5 md:ml-0 md:mt-4 md:text-center md:w-full flex flex-col md:items-center">
                              <div className="mt-3 flex items-center">
                                {renderRating(book.rating)}
                              </div>
                              {typeof book.matchScore === 'number' && (
                                <span className={`mt-2 text-xs font-medium px-2 py-0.5 rounded ${
                                  book.matchScore >= 90 ? 'bg-green-100 text-green-800' :
                                  book.matchScore >= 76 ? 'bg-blue-100 text-blue-800' :
                                  book.matchScore >= 60 ? 'bg-yellow-100 text-yellow-800' : ''
                                }`}>
                                  {book.matchScore >= 90 ? 'Great match' : book.matchScore >= 76 ? 'Good match' : 'Fair match'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="md:w-3/4 flex flex-col">
                            <div className="p-5 pb-3">
                              <h4 className="font-semibold text-black dark:text-white text-xl mb-1">{book.title}</h4>
                              <p className="text-black dark:text-gray-300 text-sm mb-3">by {book.author}</p>
                              <div className="mt-2 mb-3 text-sm bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 p-3 rounded-md border border-orange-100 dark:border-orange-800">
                                <p className="text-orange-800 dark:text-orange-300 font-medium mb-1">Why we recommend it</p>
                                <p className="text-orange-700 dark:text-orange-400">
                                  {(() => {
                                    const influence = book.matchedFrom && book.matchedTerm ? (book.matchedFrom === 'author'
                                      ? `because you like ${book.matchedTerm}`
                                      : `because you love "${book.matchedTerm}"`) : '';
                                    const reason = (book.matchReason || '').trim();
                                    const normalized = reason
                                      .replace(/using fallback algo/gi, '')
                                      .replace(/the user's/gi, 'your')
                                      .replace(/user has/gi, 'you have')
                                      .replace(/user likes/gi, 'you like')
                                      .replace(/user enjoys/gi, 'you enjoy')
                                      .replace(/user is/gi, 'you are')
                                      .replace(/user will/gi, 'you will')
                                      .replace(/user/gi, 'you')
                                      .trim();
                                    const combined = [influence, normalized].filter(Boolean).join('; ');
                                    if (combined) return combined;
                                    if (typeof book.matchScore === 'number') {
                                      if (book.matchScore >= 90) return 'It’s an excellent match for your selected authors and genres.';
                                      if (book.matchScore >= 75) return 'It aligns well with your preferred authors and genres.';
                                      if (book.matchScore >= 60) return 'It fits parts of your reading preferences.';
                                    }
                                    return 'It matches your reading preferences and history.';
                                  })()}
                                </p>
                              </div>
                              <div className="text-sm text-black dark:text-gray-300">
                                <p className={expandedBooks.includes(originalIndex) ? '' : 'line-clamp-3'}>
                                  {book.summary}
                                </p>
                                {book.summary && book.summary.length > 240 && (
                                  <button 
                                    onClick={() => toggleExpand(originalIndex)}
                                    className="mt-2 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-sm flex items-center font-medium"
                                  >
                                    {expandedBooks.includes(originalIndex) ? (
                                      <>
                                        <ChevronUp className="h-4 w-4 mr-1" /> 
                                        Read Less
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-4 w-4 mr-1" /> 
                                        Read More
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="mt-auto p-5 pt-3 border-t border-slate-200 dark:border-slate-700">
                              <div className="flex justify-between gap-3">
                                <button 
                                  className={`
                                    ${savedBookIds.includes(originalIndex) 
                                      ? 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/40' 
                                      : 'bg-white dark:bg-gray-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-300'} 
                                    text-sm font-medium flex items-center px-3 py-1 rounded ${savingBookIds.includes(originalIndex) ? 'opacity-50 cursor-not-allowed' : ''}
                                  `}
                                  onClick={() => toggleBookSave(book, originalIndex)}
                                  disabled={savingBookIds.includes(originalIndex)}
                                >
                                  {savingBookIds.includes(originalIndex) ? (
                                    <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  ) : (
                                    <svg 
                                      xmlns="http://www.w3.org/2000/svg" 
                                      className="h-4 w-4 mr-1.5" 
                                      fill={savedBookIds.includes(originalIndex) ? "currentColor" : "none"}
                                      viewBox="0 0 24 24" 
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                                    </svg>
                                  )}
                                  {savedBookIds.includes(originalIndex) ? 'Saved to List' : 'Save for Later'}
                                </button>
                                <a 
                                  href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}&tag=gratitudedriv-20`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-amber-400 hover:bg-amber-500 text-black px-3 py-1 rounded text-sm font-medium"
                                >
                                  Buy on Amazon
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  {newPicks.filter(book => !isBookAlreadyRead(book) && !book.isBookYouveRead).length === 0 && (
                    <div className="text-sm text-slate-500 italic">No new external picks yet. Try adding favorite authors or books, or adjust your preferences.</div>
                  )}
                </div>
              </div>
              
              {/* Books You've Already Read section */}
              {goodreadsData && goodreadsData.length > 0 && recommendations.some(book => isBookAlreadyRead(book)) && (
                <div className="mt-12">
                  <h3 className="text-xl font-semibold mb-4 text-orange-700 dark:text-orange-400">Books You've Already Read</h3>
                  <p className="text-slate-400 mb-4">
                    We detected these books in your photo, but it looks like you've already read them according to your Goodreads data.
                  </p>
                  <div className="grid grid-cols-1 gap-6">
                    {recommendations
                      .filter(book => isBookAlreadyRead(book))
                      .map((book, index) => (
                        <div 
                          key={`read-${index}`} 
                          className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="md:flex">
                            <div className="p-5 flex md:flex-col md:items-center md:w-1/4 md:border-r border-orange-200 dark:border-orange-800">
                              {book.coverUrl ? (
                                <div className="relative">
                                  <img 
                                    src={book.coverUrl} 
                                    alt={book.title}
                                    className="w-24 h-36 md:w-32 md:h-48 object-cover rounded-md shadow-sm"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      if (target.src === book.coverUrl) {
                                        const fallbackUrl = book.coverUrl.replace('http://', 'https://');
                                        target.src = fallbackUrl;
                                      }
                                    }}
                                  />
                                  <div className="absolute inset-0 rounded-md shadow-inner"></div>
                                </div>
                              ) : (
                                <div className="w-24 h-36 md:w-32 md:h-48 bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 flex items-center justify-center rounded-md shadow-sm">
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
                                    className="h-8 w-8 text-orange-400"
                                  >
                                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                                  </svg>
                                </div>
                              )}
                              
                              <div className="ml-5 md:ml-0 md:mt-4 md:text-center md:w-full flex flex-col md:items-center">
                                <div className="mt-3 flex items-center">
                                  {renderRating(book.rating)}
                                </div>
                                <span className="mt-2 text-xs font-medium px-2 py-0.5 rounded bg-orange-200 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300">
                                  Already Read
                                </span>
                              </div>
                            </div>
                            
                            <div className="md:w-3/4 flex flex-col">
                              <div className="p-5 pb-3">
                                <h4 className="font-semibold text-black dark:text-white text-xl mb-1">{book.title}</h4>
                                <p className="text-black dark:text-gray-300 text-sm mb-3">by {book.author}</p>
                                <div className="text-sm text-black dark:text-gray-300">
                                  <p className={expandedBooks.includes(index + 1000) ? '' : 'line-clamp-3'}>
                                    {book.summary}
                                  </p>
                                  {book.summary && book.summary.length > 240 && (
                                    <button 
                                      onClick={() => toggleExpand(index + 1000)}
                                      className="mt-2 text-orange-600 hover:text-orange-800 text-sm flex items-center font-medium"
                                    >
                                      {expandedBooks.includes(index + 1000) ? (
                                        <>
                                          <ChevronUp className="h-4 w-4 mr-1" /> 
                                          Read Less
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="h-4 w-4 mr-1" /> 
                                          Read More
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Donation Section - Show when recommendations are present */}
      {!isLoading && recommendations.length > 0 && (
  <div className="mt-12 bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 rounded-xl p-8 text-center border border-pink-200 dark:border-pink-800">
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Found the perfect book? 🎉
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 leading-relaxed">
              Support BookGlance and help us recommend more amazing books! 
              Your contribution keeps our AI recommendations improving.
            </p>
            <DonationButton 
              onClick={() => setDonationModalOpen(true)} 
              variant="default"
              className="mx-auto"
            />
          </div>
        </div>
      )}

      {/* Donation Modal */}
      <DonationModal 
        isOpen={donationModalOpen} 
        onClose={() => setDonationModalOpen(false)} 
      />
    </div>
  );
}