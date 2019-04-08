import { Component, linkEvent } from 'inferno';
import { Subscription } from "rxjs";
import { retryWhen, delay, take } from 'rxjs/operators';
import { UserOperation, Community, Post as PostI, GetPostResponse, PostResponse, Comment,  CommentResponse, CommentSortType, CreatePostLikeResponse, CommunityUser, CommunityResponse, CommentNode as CommentNodeI } from '../interfaces';
import { WebSocketService } from '../services';
import { msgOp, hotRank } from '../utils';
import { PostListing } from './post-listing';
import { Sidebar } from './sidebar';
import { CommentForm } from './comment-form';
import { CommentNodes } from './comment-nodes';
import * as autosize from 'autosize';


interface PostState {
  post: PostI;
  comments: Array<Comment>;
  commentSort: CommentSortType;
  community: Community;
  moderators: Array<CommunityUser>;
  scrolled?: boolean;
  scrolled_comment_id?: number;
}

export class Post extends Component<any, PostState> {

  private subscription: Subscription;
  private emptyState: PostState = {
    post: null,
    comments: [],
    commentSort: CommentSortType.Hot,
    community: null,
    moderators: [],
    scrolled: false
  }

  constructor(props: any, context: any) {
    super(props, context);

    this.state = this.emptyState;

    let postId = Number(this.props.match.params.id);
    if (this.props.match.params.comment_id) {
      this.state.scrolled_comment_id = this.props.match.params.comment_id;
    }

    this.subscription = WebSocketService.Instance.subject
      .pipe(retryWhen(errors => errors.pipe(delay(3000), take(10))))
      .subscribe(
        (msg) => this.parseMessage(msg),
        (err) => console.error(err),
        () => console.log('complete')
      );

    WebSocketService.Instance.getPost(postId);
  }

  componentWillUnmount() {
    this.subscription.unsubscribe();
  }

  componentDidMount() {
    autosize(document.querySelectorAll('textarea'));
  }

  componentDidUpdate(_lastProps: any, lastState: PostState, _snapshot: any) {
    if (this.state.scrolled_comment_id && !this.state.scrolled && lastState.comments.length > 0) {
      var elmnt = document.getElementById(`comment-${this.state.scrolled_comment_id}`);
      elmnt.scrollIntoView(); 
      elmnt.classList.add("mark");
      this.state.scrolled = true;
    }
  }

  render() {
    return (
      <div class="container">
        {this.state.post && 
          <div class="row">
            <div class="col-12 col-sm-8 col-lg-7 mb-3">
              <PostListing post={this.state.post} showBody showCommunity editable />
              <div className="mb-2" />
              <CommentForm postId={this.state.post.id} />
              {this.sortRadios()}
              {this.commentsTree()}
            </div>
            <div class="col-12 col-sm-4 col-lg-3 mb-3">
              {this.state.comments.length > 0 && this.newComments()}
            </div>
            <div class="col-12 col-sm-12 col-lg-2">
              {this.sidebar()}
            </div>
          </div>
        }
      </div>
    )
  }

  sortRadios() {
    return (
      <div class="btn-group btn-group-toggle mb-3">
        <label className={`btn btn-sm btn-secondary ${this.state.commentSort === CommentSortType.Hot && 'active'}`}>Hot
          <input type="radio" value={CommentSortType.Hot}
          checked={this.state.commentSort === CommentSortType.Hot} 
          onChange={linkEvent(this, this.handleCommentSortChange)}  />
        </label>
        <label className={`btn btn-sm btn-secondary ${this.state.commentSort === CommentSortType.Top && 'active'}`}>Top
          <input type="radio" value={CommentSortType.Top}
          checked={this.state.commentSort === CommentSortType.Top} 
          onChange={linkEvent(this, this.handleCommentSortChange)}  />
        </label>
        <label className={`btn btn-sm btn-secondary ${this.state.commentSort === CommentSortType.New && 'active'}`}>New
          <input type="radio" value={CommentSortType.New}
          checked={this.state.commentSort === CommentSortType.New} 
          onChange={linkEvent(this, this.handleCommentSortChange)}  />
        </label>
      </div>
    )
  }

  newComments() {
    return (
      <div class="sticky-top">
        <h4>New Comments</h4>
        {this.state.comments.map(comment => 
          <CommentNodes nodes={[{comment: comment}]} noIndent />
        )}
      </div>
    )
  }

  sidebar() {
    return ( 
      <div class="sticky-top">
        <Sidebar community={this.state.community} moderators={this.state.moderators} />
      </div>
    );
  }
  
  handleCommentSortChange(i: Post, event: any) {
    i.state.commentSort = Number(event.target.value);
    i.setState(i.state);
  }

  private buildCommentsTree(): Array<CommentNodeI> {
    let map = new Map<number, CommentNodeI>();
    for (let comment of this.state.comments) {
      let node: CommentNodeI = {
        comment: comment,
        children: []
      };
      map.set(comment.id, { ...node });
    }
    let tree: Array<CommentNodeI> = [];
    for (let comment of this.state.comments) {
      if( comment.parent_id ) {
        map.get(comment.parent_id).children.push(map.get(comment.id));
      } 
      else {
        tree.push(map.get(comment.id));
      }
    }

    this.sortTree(tree);

    return tree;
  }

  sortTree(tree: Array<CommentNodeI>) {

    if (this.state.commentSort == CommentSortType.Top) {
      tree.sort((a, b) => b.comment.score - a.comment.score);
    } else if (this.state.commentSort == CommentSortType.New) {
      tree.sort((a, b) => b.comment.published.localeCompare(a.comment.published));
    } else if (this.state.commentSort == CommentSortType.Hot) {
      tree.sort((a, b) => hotRank(b.comment) - hotRank(a.comment));
    }

    for (let node of tree) {
      this.sortTree(node.children);
    }

  }

  commentsTree() {
    let nodes = this.buildCommentsTree();
    return (
      <div className="">
        <CommentNodes nodes={nodes} />
      </div>
    );
  }

  parseMessage(msg: any) {
    console.log(msg);
    let op: UserOperation = msgOp(msg);
    if (msg.error) {
      alert(msg.error);
      return;
    } else if (op == UserOperation.GetPost) {
      let res: GetPostResponse = msg;
      this.state.post = res.post;
      this.state.comments = res.comments;
      this.state.community = res.community;
      this.state.moderators = res.moderators;
      this.setState(this.state);
    } else if (op == UserOperation.CreateComment) {
      let res: CommentResponse = msg;
      this.state.comments.unshift(res.comment);
      this.setState(this.state);
    } else if (op == UserOperation.EditComment) {
      let res: CommentResponse = msg;
      let found = this.state.comments.find(c => c.id == res.comment.id);
      found.content = res.comment.content;
      found.updated = res.comment.updated;
      this.setState(this.state);
    }
    else if (op == UserOperation.CreateCommentLike) {
      let res: CommentResponse = msg;
      let found: Comment = this.state.comments.find(c => c.id === res.comment.id);
      found.score = res.comment.score;
      found.upvotes = res.comment.upvotes;
      found.downvotes = res.comment.downvotes;
      if (res.comment.my_vote !== null) 
        found.my_vote = res.comment.my_vote;
      this.setState(this.state);
    } else if (op == UserOperation.CreatePostLike) {
      let res: CreatePostLikeResponse = msg;
      this.state.post.my_vote = res.post.my_vote;
      this.state.post.score = res.post.score;
      this.state.post.upvotes = res.post.upvotes;
      this.state.post.downvotes = res.post.downvotes;
      this.setState(this.state);
    } else if (op == UserOperation.EditPost) {
      let res: PostResponse = msg;
      this.state.post = res.post;
      this.setState(this.state);
    } else if (op == UserOperation.EditCommunity) {
      let res: CommunityResponse = msg;
      this.state.community = res.community;
      this.state.post.community_id = res.community.id;
      this.state.post.community_name = res.community.name;
      this.setState(this.state);
    } else if (op == UserOperation.FollowCommunity) {
      let res: CommunityResponse = msg;
      this.state.community.subscribed = res.community.subscribed;
      this.state.community.number_of_subscribers = res.community.number_of_subscribers;
      this.setState(this.state);
    }

  }
}



