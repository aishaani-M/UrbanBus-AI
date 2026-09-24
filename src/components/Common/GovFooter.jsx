export default function GovFooter() {
  return (
    <footer className="gov-footer">
      <div className="gov-footer-content">
        <div className="gov-footer-left">
          <div className="gov-footer-title">UrbanBus — Urban Intelligence Platform</div>
          <div className="gov-footer-text">
            An initiative By SIH Team Intelligent Fleet, Bharat Electronics Limited, Government of India.
          </div>
        </div>
        <div className="gov-footer-right">
          <div className="gov-footer-text">
            Designed &amp; Developed by SIH2026 Team Intelligent Fleet
          </div>
          <div className="gov-footer-text">
            &copy; {new Date().getFullYear()} SIH. All Rights Reserved.
          </div>
        </div>
      </div>
      <div className="gov-tricolour" />
    </footer>
  );
}
