import React, { useEffect, useState } from 'react';
import 'react-tooltip/dist/react-tooltip.css';
import { readFeedback } from '../../services/lib/admin';
import { Feedback } from '../../interface/objects/simpleObject';
import { formatLongDate } from '../../utils/utils';
import { formatDate, formatTime } from '../../utils/utils';

const FeedbackSection = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedback, setFeedback] = useState([]);

  useEffect(() => {
    const fetchFeedback = async () => {
      try {
        const result = await readFeedback();
        setFeedback(result.data?.data);
      } catch (error) {
        console.error('Error fetching feedback:', error);
      }
    };

    fetchFeedback();
  }, []);

  return (
    <div className="flex flex-col relative h-full overflow-y-auto">
      {feedback.length > 0 ? (
        feedback.sort((a: Feedback, b: Feedback) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((item: Feedback, index: number) => (
          <div key={index} className="text-white bg-midnight-dark p-4 rounded-lg mb-2">
            <div className="text-sm font-semibold">{item.first_name} {item.last_name} ({item.email}) at {formatTime(new Date(item.created_at))} on {formatLongDate(new Date(item.created_at))}</div>
            <div className="text-sm mt-2">{item.text || "No text."}</div>
          </div>
        ))
      ) : (
        <div>No feedback available.</div>
      )}
      
    </div>
  );
};

export default FeedbackSection;
