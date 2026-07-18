interface BannerLink {
  text: string;
  link: string;
}

interface BannerProps {
  image?: string;
  imageCircle?: boolean;
  swap?: boolean;
  tagline?: string;
  title?: string;
  description?: string;
  descriptions?: string[];
  keywords?: string;
  links?: BannerLink[];
}

export function Banner({
  image,
  imageCircle = false,
  swap = false,
  tagline,
  title,
  description,
  descriptions,
  keywords,
  links = [],
}: BannerProps) {
  return (
    <section className="w-full flex flex-col md:flex-row py-12 md:py-16 items-center justify-center">
      {image ? (
        <div
          className={`w-full md:w-6/12 px-8 md:px-16 pb-12 flex items-center md:justify-center ${swap ? "md:order-2" : ""}`}
        >
          <img src={image} className={imageCircle ? "rounded-full" : ""} alt="" />
        </div>
      ) : null}
      <div className={`flex flex-col w-full md:w-6/12 justify-center ${image ? "" : "items-center"}`}>
        {tagline ? <div className="text-4xl -mb-4 font-bold text-grass">{tagline}</div> : null}
        {title ? (
          <div className={`text-6xl font-bold text-grass2 leading-none ${image ? "" : "text-center"}`}>
            {title}
          </div>
        ) : null}
        {description ? <div className="text-black text-3xl pt-3">{description}</div> : null}
        {descriptions ? (
          <div className="text-black flex flex-col text-xl pt-3">
            {descriptions.map((item) => (
              <div key={item} className="pb-3">
                {item}
              </div>
            ))}
          </div>
        ) : null}
        {keywords ? <div className="text-grass3 font-bold text-sm pt-6">{keywords}</div> : null}
        {links.length ? (
          <div className="text-grass3 font-bold text-sm pt-6 flex flex-row">
            {links.length > 1
              ? links.map((link, index) => (
                  <a
                    key={link.link}
                    target="_blank"
                    rel="noreferrer"
                    className="pb-2 pr-2 text-lg"
                    href={link.link}
                  >
                    {link.text}
                    {index !== links.length - 1 ? ", " : ""}
                  </a>
                ))
              : links.map((link) => (
                  <a
                    key={link.link}
                    className="py-2 px-5 bg-grass2 text-white rounded-md text-lg"
                    href={link.link}
                  >
                    {link.text}
                  </a>
                ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
